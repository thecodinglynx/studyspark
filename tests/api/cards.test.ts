import { describe, expect, it } from "vitest";
import { DELETE, PUT } from "@/app/api/subjects/[id]/cards/[cardId]/route";
import { POST } from "@/app/api/subjects/[id]/cards/route";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createFlashcardSubject,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { json, request, routeContext } from "../helpers/http";

const add = (id: string, body: unknown) =>
  POST(request("POST", `/api/subjects/${id}/cards`, body), routeContext({ id }));
const update = (id: string, cardId: string, body: unknown) =>
  PUT(
    request("PUT", `/api/subjects/${id}/cards/${cardId}`, body),
    routeContext({ id, cardId })
  );
const remove = (id: string, cardId: string) =>
  DELETE(
    request("DELETE", `/api/subjects/${id}/cards/${cardId}`),
    routeContext({ id, cardId })
  );

async function setup() {
  const owner = await createUser({ username: "owner" });
  const editor = await createUser({ username: "editor" });
  const viewer = await createUser({ username: "viewer" });
  const stranger = await createUser({ username: "stranger" });
  const { subject, cards } = await createFlashcardSubject(owner.id);
  await shareSubject(subject.id, editor.id, "EDITOR");
  await shareSubject(subject.id, viewer.id, "VIEWER");
  return { owner, editor, viewer, stranger, subject, cards };
}

describe("POST /api/subjects/:id/cards", () => {
  it("requires a login", async () => {
    const { subject } = await setup();

    expect((await add(subject.id, { prompt: "Q", answer: "A" })).status).toBe(401);
    expect(await prisma.card.count()).toBe(3);
  });

  it.each(["owner", "editor"] as const)("lets the %s add a card", async (who) => {
    const context = await setup();

    signInAs(context[who]);
    const response = await add(context.subject.id, { prompt: "New Q", answer: "New A" });

    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({
      prompt: "New Q",
      answer: "New A",
      subjectId: context.subject.id,
    });
    expect(await prisma.card.count({ where: { subjectId: context.subject.id } })).toBe(4);
  });

  it.each(["viewer", "stranger"] as const)("does not let a %s add a card", async (who) => {
    const context = await setup();

    signInAs(context[who]);
    const response = await add(context.subject.id, { prompt: "New Q", answer: "New A" });

    expect(response.status).toBe(403);
    expect(await prisma.card.count()).toBe(3);
  });

  it.each([
    ["an empty prompt", { prompt: "", answer: "A" }],
    ["an empty answer", { prompt: "Q", answer: "" }],
    ["a missing answer", { prompt: "Q" }],
    ["a prompt longer than 500 characters", { prompt: "x".repeat(501), answer: "A" }],
    ["an answer longer than 500 characters", { prompt: "Q", answer: "x".repeat(501) }],
  ])("rejects %s", async (_label, body) => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await add(subject.id, body)).status).toBe(400);
    expect(await prisma.card.count()).toBe(3);
  });
});

describe("PUT /api/subjects/:id/cards/:cardId", () => {
  it("requires a login", async () => {
    const { subject, cards } = await setup();

    expect((await update(subject.id, cards[0].id, { prompt: "Changed" })).status).toBe(401);
  });

  it.each(["owner", "editor"] as const)("lets the %s edit a card", async (who) => {
    const context = await setup();
    const card = context.cards[0];

    signInAs(context[who]);
    const response = await update(context.subject.id, card.id, {
      prompt: "Changed Q",
      answer: "Changed A",
    });

    expect(response.status).toBe(200);
    expect(await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).toMatchObject({
      prompt: "Changed Q",
      answer: "Changed A",
    });
  });

  it("can change just the answer", async () => {
    const { owner, subject, cards } = await setup();

    signInAs(owner);
    await update(subject.id, cards[0].id, { answer: "Four" });

    expect(await prisma.card.findUniqueOrThrow({ where: { id: cards[0].id } })).toMatchObject({
      prompt: "2 + 2",
      answer: "Four",
    });
  });

  it.each(["viewer", "stranger"] as const)("does not let a %s edit a card", async (who) => {
    const context = await setup();

    signInAs(context[who]);
    const response = await update(context.subject.id, context.cards[0].id, {
      prompt: "Hijacked",
    });

    expect(response.status).toBe(403);
    const stored = await prisma.card.findUniqueOrThrow({ where: { id: context.cards[0].id } });
    expect(stored.prompt).toBe("2 + 2");
  });

  it("refuses to edit a card through a different subject the user controls", async () => {
    const { cards } = await setup();
    const attacker = await createUser();
    const { subject: attackerSubject } = await createFlashcardSubject(attacker.id);

    signInAs(attacker);
    const response = await update(attackerSubject.id, cards[0].id, { prompt: "Hijacked" });

    expect(response.status).toBe(404);
    const stored = await prisma.card.findUniqueOrThrow({ where: { id: cards[0].id } });
    expect(stored.prompt).toBe("2 + 2");
  });

  it("returns 404 for a card that does not exist", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await update(subject.id, "missing", { prompt: "Q" })).status).toBe(404);
  });

  it("rejects an empty prompt", async () => {
    const { owner, subject, cards } = await setup();

    signInAs(owner);

    expect((await update(subject.id, cards[0].id, { prompt: "" })).status).toBe(400);
  });
});

describe("DELETE /api/subjects/:id/cards/:cardId", () => {
  it("requires a login", async () => {
    const { subject, cards } = await setup();

    expect((await remove(subject.id, cards[0].id)).status).toBe(401);
    expect(await prisma.card.count()).toBe(3);
  });

  it.each(["owner", "editor"] as const)("lets the %s remove a card", async (who) => {
    const context = await setup();

    signInAs(context[who]);
    const response = await remove(context.subject.id, context.cards[0].id);

    expect(response.status).toBe(200);
    const remaining = await prisma.card.findMany({ orderBy: { createdAt: "asc" } });
    expect(remaining.map((c) => c.id)).toEqual([context.cards[1].id, context.cards[2].id]);
  });

  it("also removes the card's performance history", async () => {
    const { owner, subject, cards } = await setup();
    await prisma.cardPerformance.create({
      data: { cardId: cards[0].id, subjectId: subject.id, userId: owner.id, incorrectCount: 2 },
    });

    signInAs(owner);
    const response = await remove(subject.id, cards[0].id);

    expect(response.status).toBe(200);
    expect(await prisma.cardPerformance.count()).toBe(0);
  });

  it.each(["viewer", "stranger"] as const)("does not let a %s remove a card", async (who) => {
    const context = await setup();

    signInAs(context[who]);

    expect((await remove(context.subject.id, context.cards[0].id)).status).toBe(403);
    expect(await prisma.card.count()).toBe(3);
  });

  it("refuses to remove a card through a different subject the user controls", async () => {
    const { cards } = await setup();
    const attacker = await createUser();
    const { subject: attackerSubject } = await createFlashcardSubject(attacker.id);

    signInAs(attacker);

    expect((await remove(attackerSubject.id, cards[0].id)).status).toBe(404);
    expect(await prisma.card.count({ where: { id: cards[0].id } })).toBe(1);
  });

  it("returns 404 for a card that does not exist", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await remove(subject.id, "missing")).status).toBe(404);
  });
});
