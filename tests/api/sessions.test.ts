import { revalidatePath } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/subjects/[id]/sessions/route";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createFlashcardSubject,
  createStudySession,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { json, request, routeContext } from "../helpers/http";

const list = (id: string) =>
  GET(request("GET", `/api/subjects/${id}/sessions`), routeContext({ id }));
const save = (id: string, body: unknown) =>
  POST(request("POST", `/api/subjects/${id}/sessions`, body), routeContext({ id }));

async function setup() {
  const owner = await createUser({ username: "owner" });
  const viewer = await createUser({ username: "viewer" });
  const stranger = await createUser({ username: "stranger" });
  const { subject, cards } = await createFlashcardSubject(owner.id);
  await shareSubject(subject.id, viewer.id, "VIEWER");
  return { owner, viewer, stranger, subject, cards };
}

describe("POST /api/subjects/:id/sessions", () => {
  it("requires a login", async () => {
    const { subject } = await setup();

    const response = await save(subject.id, {
      correct: 1,
      incorrect: 0,
      durationMin: 1,
      cardCount: 1,
    });

    expect(response.status).toBe(401);
    expect(await prisma.studySession.count()).toBe(0);
  });

  it("stores the session and per-card results for the logged-in user", async () => {
    const { owner, subject, cards } = await setup();

    signInAs(owner);
    const response = await save(subject.id, {
      correct: 2,
      incorrect: 1,
      durationMin: 4,
      cardCount: 3,
      cards: [
        { cardId: cards[0].id, correct: 1, incorrect: 0 },
        { cardId: cards[1].id, correct: 1, incorrect: 0 },
        { cardId: cards[2].id, correct: 0, incorrect: 1 },
      ],
    });

    expect(response.status).toBe(201);
    expect(await prisma.studySession.findMany()).toEqual([
      expect.objectContaining({
        subjectId: subject.id,
        userId: owner.id,
        correct: 2,
        incorrect: 1,
        durationMin: 4,
        cardCount: 3,
      }),
    ]);

    const missed = await prisma.cardPerformance.findUniqueOrThrow({
      where: { cardId_userId: { cardId: cards[2].id, userId: owner.id } },
    });
    expect(missed).toMatchObject({
      correctCount: 0,
      incorrectCount: 1,
      subjectId: subject.id,
    });
    expect(missed.lastStudiedAt).toBeInstanceOf(Date);
    expect(await prisma.cardPerformance.count()).toBe(3);
  });

  it("adds to existing per-card counts instead of replacing them", async () => {
    const { owner, subject, cards } = await setup();
    signInAs(owner);
    const run = {
      correct: 1,
      incorrect: 2,
      durationMin: 1,
      cardCount: 1,
      cards: [{ cardId: cards[0].id, correct: 1, incorrect: 2 }],
    };

    await save(subject.id, run);
    await save(subject.id, run);

    expect(
      await prisma.cardPerformance.findUniqueOrThrow({
        where: { cardId_userId: { cardId: cards[0].id, userId: owner.id } },
      })
    ).toMatchObject({ correctCount: 2, incorrectCount: 4 });
    expect(await prisma.studySession.count()).toBe(2);
  });

  it("keeps each user's card performance separate", async () => {
    const { owner, viewer, subject, cards } = await setup();
    const run = (correct: number, incorrect: number) => ({
      correct,
      incorrect,
      durationMin: 1,
      cardCount: 1,
      cards: [{ cardId: cards[0].id, correct, incorrect }],
    });

    signInAs(owner);
    await save(subject.id, run(1, 0));
    signInAs(viewer);
    await save(subject.id, run(0, 1));

    const performances = await prisma.cardPerformance.findMany({
      where: { cardId: cards[0].id },
    });
    expect(performances).toHaveLength(2);
    expect(performances.find((p) => p.userId === owner.id)).toMatchObject({
      correctCount: 1,
      incorrectCount: 0,
    });
    expect(performances.find((p) => p.userId === viewer.id)).toMatchObject({
      correctCount: 0,
      incorrectCount: 1,
    });
  });

  it("accepts a session without per-card detail", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);
    const response = await save(subject.id, {
      correct: 5,
      incorrect: 2,
      durationMin: 3,
      cardCount: 7,
    });

    expect(response.status).toBe(201);
    expect(await prisma.cardPerformance.count()).toBe(0);
  });

  it("refreshes the cached subject and dashboard pages", async () => {
    const { owner, subject } = await setup();
    vi.mocked(revalidatePath).mockClear();

    signInAs(owner);
    await save(subject.id, { correct: 1, incorrect: 0, durationMin: 1, cardCount: 1 });

    expect(revalidatePath).toHaveBeenCalledWith(`/subjects/${subject.id}`);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects per-card results that do not add up to the session totals", async () => {
    const { owner, subject, cards } = await setup();

    signInAs(owner);
    const response = await save(subject.id, {
      correct: 5,
      incorrect: 0,
      durationMin: 1,
      cardCount: 1,
      cards: [{ cardId: cards[0].id, correct: 1, incorrect: 0 }],
    });

    expect(response.status).toBe(400);
    expect((await json(response)).error).toBe("Mismatched card totals");
    expect(await prisma.studySession.count()).toBe(0);
  });

  it("rejects cards from another subject and saves nothing", async () => {
    const { owner, subject, cards } = await setup();
    const { cards: otherCards } = await createFlashcardSubject(owner.id);

    signInAs(owner);
    const response = await save(subject.id, {
      correct: 2,
      incorrect: 0,
      durationMin: 1,
      cardCount: 2,
      cards: [
        { cardId: cards[0].id, correct: 1, incorrect: 0 },
        { cardId: otherCards[0].id, correct: 1, incorrect: 0 },
      ],
    });

    expect(response.status).toBe(400);
    expect((await json(response)).error).toBe("Invalid card references");
    // The session row and the valid card's stats are rolled back together.
    expect(await prisma.studySession.count()).toBe(0);
    expect(await prisma.cardPerformance.count()).toBe(0);
  });

  it("does not let a stranger record a session", async () => {
    const { stranger, subject } = await setup();

    signInAs(stranger);
    const response = await save(subject.id, {
      correct: 1,
      incorrect: 0,
      durationMin: 1,
      cardCount: 1,
    });

    expect(response.status).toBe(403);
    expect(await prisma.studySession.count()).toBe(0);
  });

  it.each([
    ["negative counts", { correct: -1, incorrect: 0, durationMin: 1, cardCount: 1 }],
    ["fractional counts", { correct: 1.5, incorrect: 0, durationMin: 1, cardCount: 1 }],
    ["a duration longer than a day", { correct: 1, incorrect: 0, durationMin: 1441, cardCount: 1 }],
    ["a missing duration", { correct: 1, incorrect: 0, cardCount: 1 }],
    ["a missing card count", { correct: 1, incorrect: 0, durationMin: 1 }],
    ["counts as strings", { correct: "1", incorrect: "0", durationMin: 1, cardCount: 1 }],
  ])("rejects %s", async (_label, body) => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await save(subject.id, body)).status).toBe(400);
    expect(await prisma.studySession.count()).toBe(0);
  });
});

describe("GET /api/subjects/:id/sessions", () => {
  it("requires a login", async () => {
    const { subject } = await setup();

    expect((await list(subject.id)).status).toBe(401);
  });

  it("returns the caller's sessions newest first, with totals", async () => {
    const { owner, viewer, subject } = await setup();
    await createStudySession(subject.id, owner.id, {
      correct: 3,
      incorrect: 1,
      durationMin: 5,
      studiedAt: new Date("2025-03-01T10:00:00Z"),
    });
    await createStudySession(subject.id, owner.id, {
      correct: 2,
      incorrect: 2,
      durationMin: 7,
      studiedAt: new Date("2025-03-02T10:00:00Z"),
    });
    await createStudySession(subject.id, viewer.id, { correct: 50, incorrect: 50 });

    signInAs(owner);
    const response = await list(subject.id);

    expect(response.status).toBe(200);
    const body = await json<{
      sessions: Array<{ correct: number; userId: string }>;
      totals: Record<string, number>;
    }>(response);
    expect(body.sessions.map((s) => s.correct)).toEqual([2, 3]);
    expect(body.sessions.every((s) => s.userId === owner.id)).toBe(true);
    expect(body.totals).toEqual({ correct: 5, incorrect: 3, durationMin: 12, count: 2 });
  });

  it("returns zero totals when nothing has been studied", async () => {
    const { viewer, subject } = await setup();

    signInAs(viewer);
    const body = await json(await list(subject.id));

    expect(body).toEqual({
      sessions: [],
      totals: { correct: 0, incorrect: 0, durationMin: 0, count: 0 },
    });
  });

  it("does not let a stranger read sessions", async () => {
    const { stranger, subject } = await setup();

    signInAs(stranger);

    expect((await list(subject.id)).status).toBe(403);
  });
});
