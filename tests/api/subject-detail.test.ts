import { describe, expect, it } from "vitest";
import { DELETE, GET, PUT } from "@/app/api/subjects/[id]/route";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createChecklistSubject,
  createFlashcardSubject,
  createStudySession,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { json, request, routeContext } from "../helpers/http";

const path = (id: string) => `/api/subjects/${id}`;
const get = (id: string) => GET(request("GET", path(id)), routeContext({ id }));
const put = (id: string, body: unknown) =>
  PUT(request("PUT", path(id), body), routeContext({ id }));
const del = (id: string) => DELETE(request("DELETE", path(id)), routeContext({ id }));

describe("GET /api/subjects/:id", () => {
  it("requires a login", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    expect((await get(subject.id)).status).toBe(401);
  });

  it("returns the subject with its cards in creation order to the owner", async () => {
    const owner = await createUser({ username: "owner" });
    const { subject } = await createFlashcardSubject(owner.id, { title: "Chemistry" });

    signInAs(owner);
    const response = await get(subject.id);

    expect(response.status).toBe(200);
    const body = await json<{
      title: string;
      owner: { username: string };
      cards: Array<{ prompt: string }>;
    }>(response);
    expect(body.title).toBe("Chemistry");
    expect(body.owner.username).toBe("owner");
    expect(body.cards.map((c) => c.prompt)).toEqual(["2 + 2", "Capital of France", "H2O"]);
  });

  it("returns checklist items in position order", async () => {
    const owner = await createUser();
    const { subject } = await createChecklistSubject(owner.id, {
      items: [{ title: "First" }, { title: "Second" }, { title: "Third" }],
    });

    signInAs(owner);
    const body = await json<{ checklistItems: Array<{ title: string }> }>(
      await get(subject.id)
    );

    expect(body.checklistItems.map((i) => i.title)).toEqual(["First", "Second", "Third"]);
  });

  it("lets a user it is shared with read it", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, viewer.id, "VIEWER");

    signInAs(viewer);

    expect((await get(subject.id)).status).toBe(200);
  });

  it("only includes the caller's own study sessions", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, viewer.id);
    await createStudySession(subject.id, owner.id, { correct: 3 });
    await createStudySession(subject.id, viewer.id, { correct: 1 });

    signInAs(viewer);
    const body = await json<{ sessions: Array<{ userId: string }> }>(await get(subject.id));

    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].userId).toBe(viewer.id);
  });

  it("hides subjects from users without access", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(stranger);

    expect((await get(subject.id)).status).toBe(404);
  });

  it("returns 404 for an id that does not exist", async () => {
    signInAs(await createUser());

    expect((await get("does-not-exist")).status).toBe(404);
  });

  it("never exposes password hashes", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, viewer.id);

    signInAs(owner);

    expect(await (await get(subject.id)).text()).not.toContain("passwordHash");
  });
});

describe("PUT /api/subjects/:id", () => {
  it("requires a login", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    expect((await put(subject.id, { title: "New title" })).status).toBe(401);
  });

  it("lets the owner change title, description and study goal", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(owner);
    const response = await put(subject.id, {
      title: "New title",
      description: "New description",
      studyGoal: 15,
    });

    expect(response.status).toBe(200);
    expect(
      await prisma.subject.findUniqueOrThrow({ where: { id: subject.id } })
    ).toMatchObject({ title: "New title", description: "New description", studyGoal: 15 });
  });

  it("leaves fields that were not sent unchanged", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id, {
      title: "Original",
      description: "Keep me",
    });

    signInAs(owner);
    await put(subject.id, { studyGoal: 5 });

    expect(
      await prisma.subject.findUniqueOrThrow({ where: { id: subject.id } })
    ).toMatchObject({ title: "Original", description: "Keep me", studyGoal: 5 });
  });

  it("clears the description when sent null", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id, { description: "Old" });

    signInAs(owner);
    await put(subject.id, { description: null });

    const stored = await prisma.subject.findUniqueOrThrow({ where: { id: subject.id } });
    expect(stored.description).toBeNull();
  });

  it.each(["VIEWER", "EDITOR"] as const)(
    "does not let a %s collaborator change subject settings",
    async (role) => {
      const owner = await createUser();
      const collaborator = await createUser();
      const { subject } = await createFlashcardSubject(owner.id, { title: "Original" });
      await shareSubject(subject.id, collaborator.id, role);

      signInAs(collaborator);
      const response = await put(subject.id, { title: "Hijacked" });

      expect(response.status).toBe(403);
      const stored = await prisma.subject.findUniqueOrThrow({ where: { id: subject.id } });
      expect(stored.title).toBe("Original");
    }
  );

  it("does not let a stranger change it", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(await createUser());

    expect((await put(subject.id, { title: "Hijacked" })).status).toBe(403);
  });

  it.each([
    ["a too-short title", { title: "ab" }],
    ["a non-integer study goal", { studyGoal: 1.5 }],
    ["a study goal above 1000", { studyGoal: 1001 }],
    ["a description longer than 500 characters", { description: "x".repeat(501) }],
  ])("rejects %s", async (_label, body) => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(owner);

    expect((await put(subject.id, body)).status).toBe(400);
  });
});

describe("DELETE /api/subjects/:id", () => {
  it("requires a login", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    expect((await del(subject.id)).status).toBe(401);
    expect(await prisma.subject.count()).toBe(1);
  });

  it("lets the owner delete a flashcard subject and everything attached to it", async () => {
    const owner = await createUser();
    const friend = await createUser();
    const { subject, cards } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, friend.id, "EDITOR");
    await createStudySession(subject.id, owner.id);
    await prisma.cardPerformance.create({
      data: { cardId: cards[0].id, subjectId: subject.id, userId: owner.id, correctCount: 1 },
    });

    signInAs(owner);
    const response = await del(subject.id);

    expect(response.status).toBe(200);
    expect(await prisma.subject.count()).toBe(0);
    expect(await prisma.card.count()).toBe(0);
    expect(await prisma.subjectShare.count()).toBe(0);
    expect(await prisma.studySession.count()).toBe(0);
    expect(await prisma.cardPerformance.count()).toBe(0);
    // Deleting a subject must never delete accounts.
    expect(await prisma.user.count()).toBe(2);
  });

  it("lets the owner delete a checklist subject with its items and practice log", async () => {
    const owner = await createUser();
    const { subject, items } = await createChecklistSubject(owner.id);
    await prisma.checklistEntry.create({
      data: { subjectId: subject.id, itemId: items[0].id, userId: owner.id },
    });

    signInAs(owner);
    const response = await del(subject.id);

    expect(response.status).toBe(200);
    expect(await prisma.subject.count()).toBe(0);
    expect(await prisma.checklistItem.count()).toBe(0);
    expect(await prisma.checklistEntry.count()).toBe(0);
  });

  it("leaves other subjects untouched", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);
    const { subject: other } = await createFlashcardSubject(owner.id);

    signInAs(owner);
    await del(subject.id);

    expect(await prisma.subject.findMany()).toEqual([
      expect.objectContaining({ id: other.id }),
    ]);
    expect(await prisma.card.count({ where: { subjectId: other.id } })).toBe(3);
  });

  it.each(["VIEWER", "EDITOR"] as const)(
    "does not let a %s collaborator delete it",
    async (role) => {
      const owner = await createUser();
      const collaborator = await createUser();
      const { subject } = await createFlashcardSubject(owner.id);
      await shareSubject(subject.id, collaborator.id, role);

      signInAs(collaborator);

      expect((await del(subject.id)).status).toBe(403);
      expect(await prisma.subject.count()).toBe(1);
    }
  );

  it("does not let a stranger delete it", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(await createUser());

    expect((await del(subject.id)).status).toBe(403);
    expect(await prisma.subject.count()).toBe(1);
  });
});
