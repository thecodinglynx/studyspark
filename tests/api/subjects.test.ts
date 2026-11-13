import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/subjects/route";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createAdmin,
  createChecklistSubject,
  createFlashcardSubject,
  createStudySession,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { json, request } from "../helpers/http";

const create = (body: unknown) => POST(request("POST", "/api/subjects", body));

type ListedSubject = {
  id: string;
  title: string;
  owner: { username: string };
  shares: Array<{ role: string; user: { username: string } }>;
  _count: { cards: number; sessions: number; checklistItems: number };
  sessions: Array<{ userId: string }>;
};

describe("GET /api/subjects", () => {
  it("requires a login", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns an empty list for a new user", async () => {
    signInAs(await createUser());

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual([]);
  });

  it("lists subjects the user owns and subjects shared with them, and nothing else", async () => {
    const me = await createUser({ username: "me" });
    const friend = await createUser({ username: "friend" });
    const stranger = await createUser({ username: "stranger" });

    const { subject: mine } = await createFlashcardSubject(me.id, { title: "Mine" });
    const { subject: shared } = await createFlashcardSubject(friend.id, {
      title: "Shared with me",
    });
    await shareSubject(shared.id, me.id, "VIEWER");
    await createFlashcardSubject(stranger.id, { title: "Private" });

    signInAs(me);
    const subjects = await json<ListedSubject[]>(await GET());

    expect(subjects.map((s) => s.title).sort()).toEqual(["Mine", "Shared with me"]);
    expect(subjects.find((s) => s.id === mine.id)?.owner.username).toBe("me");
    expect(subjects.find((s) => s.id === shared.id)?.owner.username).toBe("friend");
  });

  it("includes counts and only the caller's own recent sessions, but not who else has access", async () => {
    const me = await createUser({ username: "me" });
    const friend = await createUser({ username: "friend" });
    const { subject } = await createFlashcardSubject(me.id);
    await shareSubject(subject.id, friend.id, "EDITOR");
    await createStudySession(subject.id, me.id);
    await createStudySession(subject.id, friend.id);

    signInAs(me);
    const [listed] = await json<ListedSubject[]>(await GET());

    expect(listed._count).toMatchObject({ cards: 3, sessions: 2, checklistItems: 0 });
    expect(listed.shares).toBeUndefined();
    expect(listed.sessions).toHaveLength(1);
    expect(listed.sessions[0].userId).toBe(me.id);
  });

  it("never reveals other users' names to a regular user, in any part of the response", async () => {
    const me = await createUser({ username: "me" });
    const friend = await createUser({ username: "secretpal", name: "Secret Pal" });
    const { subject } = await createFlashcardSubject(me.id);
    await shareSubject(subject.id, friend.id, "EDITOR");

    signInAs(me);
    const text = await (await GET()).text();

    expect(text).not.toContain("secretpal");
    expect(text).not.toContain("Secret Pal");
  });

  it("includes collaborators for an admin", async () => {
    const admin = await createAdmin();
    const friend = await createUser({ username: "friend" });
    const { subject } = await createFlashcardSubject(admin.id);
    await shareSubject(subject.id, friend.id, "EDITOR");

    signInAs(admin);
    const [listed] = await json<ListedSubject[]>(await GET());

    expect(listed.shares).toEqual([
      expect.objectContaining({
        role: "EDITOR",
        user: expect.objectContaining({ username: "friend" }),
      }),
    ]);
  });

  it("never exposes password hashes of owners or collaborators", async () => {
    const me = await createUser();
    const friend = await createUser();
    const { subject } = await createChecklistSubject(me.id);
    await shareSubject(subject.id, friend.id);

    signInAs(me);
    const text = await (await GET()).text();

    expect(text).not.toContain("passwordHash");
  });
});

describe("POST /api/subjects", () => {
  it("requires a login", async () => {
    const response = await create({
      type: "FLASHCARDS",
      title: "Chemistry",
      cards: [{ prompt: "H", answer: "Hydrogen" }],
    });

    expect(response.status).toBe(401);
    expect(await prisma.subject.count()).toBe(0);
  });

  it("creates a flashcard subject with its cards", async () => {
    const me = await createUser();
    signInAs(me);

    const response = await create({
      type: "FLASHCARDS",
      title: "Chemistry",
      description: "Exam 3",
      studyGoal: 20,
      cards: [
        { prompt: "H", answer: "Hydrogen" },
        { prompt: "He", answer: "Helium" },
      ],
    });

    expect(response.status).toBe(201);
    const body = await json<{ id: string }>(response);

    const stored = await prisma.subject.findUniqueOrThrow({
      where: { id: body.id },
      include: { cards: true, checklistItems: true },
    });
    expect(stored).toMatchObject({
      title: "Chemistry",
      description: "Exam 3",
      studyGoal: 20,
      type: "FLASHCARDS",
      ownerId: me.id,
    });
    expect(stored.cards.map((c) => c.prompt).sort()).toEqual(["H", "He"]);
    expect(stored.checklistItems).toEqual([]);
  });

  it("creates a checklist subject and keeps the item order", async () => {
    const me = await createUser();
    signInAs(me);

    const response = await create({
      type: "CHECKLIST",
      title: "Piano practice",
      items: [
        { title: "Scales", description: "Major and minor" },
        { title: "Arpeggios" },
        { title: "Repertoire" },
      ],
    });

    expect(response.status).toBe(201);
    const body = await json<{ id: string }>(response);

    const items = await prisma.checklistItem.findMany({
      where: { subjectId: body.id },
      orderBy: { position: "asc" },
    });
    expect(items.map((i) => [i.position, i.title, i.description])).toEqual([
      [0, "Scales", "Major and minor"],
      [1, "Arpeggios", null],
      [2, "Repertoire", null],
    ]);
  });

  it("defaults the study goal to 0", async () => {
    signInAs(await createUser());

    const response = await create({
      type: "FLASHCARDS",
      title: "Chemistry",
      cards: [{ prompt: "H", answer: "Hydrogen" }],
    });

    expect((await json(response)).studyGoal).toBe(0);
  });

  it.each([
    ["a missing type", { title: "Chemistry", cards: [{ prompt: "H", answer: "Hydrogen" }] }],
    ["an unknown type", { type: "QUIZ", title: "Chemistry", cards: [] }],
    ["a title shorter than 3 characters", { type: "FLASHCARDS", title: "ab", cards: [{ prompt: "H", answer: "Hydrogen" }] }],
    ["a title longer than 120 characters", { type: "FLASHCARDS", title: "x".repeat(121), cards: [{ prompt: "H", answer: "Hydrogen" }] }],
    ["a description longer than 500 characters", { type: "FLASHCARDS", title: "Chemistry", description: "x".repeat(501), cards: [{ prompt: "H", answer: "Hydrogen" }] }],
    ["a flashcard subject without cards", { type: "FLASHCARDS", title: "Chemistry", cards: [] }],
    ["a card with an empty prompt", { type: "FLASHCARDS", title: "Chemistry", cards: [{ prompt: "", answer: "Hydrogen" }] }],
    ["a card with an empty answer", { type: "FLASHCARDS", title: "Chemistry", cards: [{ prompt: "H", answer: "" }] }],
    ["a card prompt longer than 500 characters", { type: "FLASHCARDS", title: "Chemistry", cards: [{ prompt: "x".repeat(501), answer: "a" }] }],
    ["a checklist subject without items", { type: "CHECKLIST", title: "Piano", items: [] }],
    ["a checklist subject given cards instead of items", { type: "CHECKLIST", title: "Piano", cards: [{ prompt: "H", answer: "Hydrogen" }] }],
    ["a checklist item with an empty title", { type: "CHECKLIST", title: "Piano", items: [{ title: "" }] }],
    ["a negative study goal", { type: "FLASHCARDS", title: "Chemistry", studyGoal: -1, cards: [{ prompt: "H", answer: "Hydrogen" }] }],
    ["a study goal above 1000", { type: "FLASHCARDS", title: "Chemistry", studyGoal: 1001, cards: [{ prompt: "H", answer: "Hydrogen" }] }],
  ])("rejects %s", async (_label, body) => {
    signInAs(await createUser());

    const response = await create(body);

    expect(response.status).toBe(400);
    expect((await json(response)).error).toBe("Invalid data");
    expect(await prisma.subject.count()).toBe(0);
  });
});
