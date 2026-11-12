import { describe, expect, it } from "vitest";
import { POST as LOG_PRACTICE } from "@/app/api/subjects/[id]/checklist/route";
import { POST as PRACTICE_ONE } from "@/app/api/subjects/[id]/items/[itemId]/practice/route";
import { DELETE, PUT } from "@/app/api/subjects/[id]/items/[itemId]/route";
import { POST as ADD_ITEM } from "@/app/api/subjects/[id]/items/route";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createChecklistSubject,
  createFlashcardSubject,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { json, rawRequest, request, routeContext } from "../helpers/http";

const addItem = (id: string, body: unknown) =>
  ADD_ITEM(request("POST", `/api/subjects/${id}/items`, body), routeContext({ id }));
const updateItem = (id: string, itemId: string, body: unknown) =>
  PUT(
    request("PUT", `/api/subjects/${id}/items/${itemId}`, body),
    routeContext({ id, itemId })
  );
const removeItem = (id: string, itemId: string) =>
  DELETE(
    request("DELETE", `/api/subjects/${id}/items/${itemId}`),
    routeContext({ id, itemId })
  );
const practiceOne = (id: string, itemId: string) =>
  PRACTICE_ONE(
    request("POST", `/api/subjects/${id}/items/${itemId}/practice`),
    routeContext({ id, itemId })
  );
const logPractice = (id: string, body: unknown) =>
  LOG_PRACTICE(request("POST", `/api/subjects/${id}/checklist`, body), routeContext({ id }));

async function setup() {
  const owner = await createUser({ username: "owner" });
  const editor = await createUser({ username: "editor" });
  const viewer = await createUser({ username: "viewer" });
  const stranger = await createUser({ username: "stranger" });
  const { subject, items } = await createChecklistSubject(owner.id);
  await shareSubject(subject.id, editor.id, "EDITOR");
  await shareSubject(subject.id, viewer.id, "VIEWER");
  return { owner, editor, viewer, stranger, subject, items };
}

describe("POST /api/subjects/:id/items", () => {
  it("requires a login", async () => {
    const { subject } = await setup();

    expect((await addItem(subject.id, { title: "New" })).status).toBe(401);
  });

  it.each(["owner", "editor"] as const)(
    "lets the %s add an item at the end of the list",
    async (who) => {
      const context = await setup();

      signInAs(context[who]);
      const response = await addItem(context.subject.id, {
        title: "Improvisation",
        description: "Five minutes",
      });

      expect(response.status).toBe(201);
      expect(await json(response)).toMatchObject({
        title: "Improvisation",
        description: "Five minutes",
        position: 2,
      });
      const titles = await prisma.checklistItem.findMany({ orderBy: { position: "asc" } });
      expect(titles.map((i) => i.title)).toEqual([
        "Warm-up scales",
        "Sight reading",
        "Improvisation",
      ]);
    }
  );

  it.each(["viewer", "stranger"] as const)("does not let a %s add an item", async (who) => {
    const context = await setup();

    signInAs(context[who]);

    expect((await addItem(context.subject.id, { title: "New" })).status).toBe(403);
    expect(await prisma.checklistItem.count()).toBe(2);
  });

  it("refuses to add checklist items to a flashcard subject", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(owner);

    expect((await addItem(subject.id, { title: "New" })).status).toBe(403);
    expect(await prisma.checklistItem.count()).toBe(0);
  });

  it.each([
    ["an empty title", { title: "" }],
    ["a missing title", { description: "No title" }],
    ["a title longer than 200 characters", { title: "x".repeat(201) }],
    ["a description longer than 500 characters", { title: "Ok", description: "x".repeat(501) }],
  ])("rejects %s", async (_label, body) => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await addItem(subject.id, body)).status).toBe(400);
    expect(await prisma.checklistItem.count()).toBe(2);
  });
});

describe("PUT /api/subjects/:id/items/:itemId", () => {
  it("requires a login", async () => {
    const { subject, items } = await setup();

    expect((await updateItem(subject.id, items[0].id, { title: "Changed" })).status).toBe(401);
  });

  it.each(["owner", "editor"] as const)("lets the %s edit an item", async (who) => {
    const context = await setup();

    signInAs(context[who]);
    const response = await updateItem(context.subject.id, context.items[0].id, {
      title: "Changed",
      description: null,
    });

    expect(response.status).toBe(200);
    expect(
      await prisma.checklistItem.findUniqueOrThrow({ where: { id: context.items[0].id } })
    ).toMatchObject({ title: "Changed", description: null, position: 0 });
  });

  it.each(["viewer", "stranger"] as const)("does not let a %s edit an item", async (who) => {
    const context = await setup();

    signInAs(context[who]);
    const response = await updateItem(context.subject.id, context.items[0].id, {
      title: "Hijacked",
    });

    expect(response.status).toBe(403);
    const stored = await prisma.checklistItem.findUniqueOrThrow({
      where: { id: context.items[0].id },
    });
    expect(stored.title).toBe("Warm-up scales");
  });

  it("refuses to edit an item through a different subject the user controls", async () => {
    const { items } = await setup();
    const attacker = await createUser();
    const { subject: attackerSubject } = await createChecklistSubject(attacker.id);

    signInAs(attacker);
    const response = await updateItem(attackerSubject.id, items[0].id, { title: "Hijacked" });

    expect(response.status).toBe(404);
  });

  it("rejects an empty title", async () => {
    const { owner, subject, items } = await setup();

    signInAs(owner);

    expect((await updateItem(subject.id, items[0].id, { title: "" })).status).toBe(400);
  });
});

describe("DELETE /api/subjects/:id/items/:itemId", () => {
  it("requires a login", async () => {
    const { subject, items } = await setup();

    expect((await removeItem(subject.id, items[0].id)).status).toBe(401);
  });

  it.each(["owner", "editor"] as const)(
    "lets the %s remove an item along with its practice log",
    async (who) => {
      const context = await setup();
      await prisma.checklistEntry.create({
        data: {
          subjectId: context.subject.id,
          itemId: context.items[0].id,
          userId: context.owner.id,
        },
      });

      signInAs(context[who]);
      const response = await removeItem(context.subject.id, context.items[0].id);

      expect(response.status).toBe(200);
      const remaining = await prisma.checklistItem.findMany();
      expect(remaining.map((i) => i.id)).toEqual([context.items[1].id]);
      expect(await prisma.checklistEntry.count()).toBe(0);
    }
  );

  it.each(["viewer", "stranger"] as const)("does not let a %s remove an item", async (who) => {
    const context = await setup();

    signInAs(context[who]);

    expect((await removeItem(context.subject.id, context.items[0].id)).status).toBe(403);
    expect(await prisma.checklistItem.count()).toBe(2);
  });

  it("returns 404 for an item that does not exist", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await removeItem(subject.id, "missing")).status).toBe(404);
  });
});

describe("POST /api/subjects/:id/items/:itemId/practice", () => {
  it("requires a login", async () => {
    const { subject, items } = await setup();

    expect((await practiceOne(subject.id, items[0].id)).status).toBe(401);
  });

  it.each(["owner", "editor", "viewer"] as const)(
    "lets the %s log practice for one item under their own name",
    async (who) => {
      const context = await setup();

      signInAs(context[who]);
      const response = await practiceOne(context.subject.id, context.items[1].id);

      expect(response.status).toBe(201);
      expect(await json(response)).toMatchObject({
        userId: context[who].id,
        item: { id: context.items[1].id, title: "Sight reading" },
      });
      expect(await prisma.checklistEntry.count()).toBe(1);
    }
  );

  it("does not let a stranger log practice", async () => {
    const { stranger, subject, items } = await setup();

    signInAs(stranger);

    expect((await practiceOne(subject.id, items[0].id)).status).toBe(403);
    expect(await prisma.checklistEntry.count()).toBe(0);
  });

  it("returns 404 for an item from another subject", async () => {
    const { owner, subject } = await setup();
    const { items: otherItems } = await createChecklistSubject(owner.id);

    signInAs(owner);

    expect((await practiceOne(subject.id, otherItems[0].id)).status).toBe(404);
  });
});

describe("POST /api/subjects/:id/checklist", () => {
  it("requires a login", async () => {
    const { subject, items } = await setup();

    expect((await logPractice(subject.id, { itemIds: [items[0].id] })).status).toBe(401);
  });

  it.each(["owner", "editor", "viewer"] as const)(
    "lets the %s log several items at once",
    async (who) => {
      const context = await setup();

      signInAs(context[who]);
      const response = await logPractice(context.subject.id, {
        itemIds: context.items.map((i) => i.id),
      });

      expect(response.status).toBe(201);
      const entries = await prisma.checklistEntry.findMany();
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.userId === context[who].id)).toBe(true);
      expect(entries.every((e) => e.subjectId === context.subject.id)).toBe(true);
      // One run shares a single timestamp.
      expect(entries[0].practicedAt).toEqual(entries[1].practicedAt);
    }
  );

  it("logs an item only once even if its id is repeated", async () => {
    const { owner, subject, items } = await setup();

    signInAs(owner);
    await logPractice(subject.id, { itemIds: [items[0].id, items[0].id, items[0].id] });

    expect(await prisma.checklistEntry.count()).toBe(1);
  });

  it("ignores ids that belong to another subject but logs the valid ones", async () => {
    const { owner, subject, items } = await setup();
    const { items: otherItems } = await createChecklistSubject(owner.id);

    signInAs(owner);
    const response = await logPractice(subject.id, {
      itemIds: [items[0].id, otherItems[0].id],
    });

    expect(response.status).toBe(201);
    const entries = await prisma.checklistEntry.findMany();
    expect(entries.map((e) => e.itemId)).toEqual([items[0].id]);
  });

  it("rejects a run where no id belongs to the subject", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);
    const response = await logPractice(subject.id, { itemIds: ["missing"] });

    expect(response.status).toBe(400);
    expect((await json(response)).error).toBe("Invalid items");
  });

  it("does not let a stranger log practice", async () => {
    const { stranger, subject, items } = await setup();

    signInAs(stranger);

    expect((await logPractice(subject.id, { itemIds: [items[0].id] })).status).toBe(403);
    expect(await prisma.checklistEntry.count()).toBe(0);
  });

  it("refuses checklist runs on a flashcard subject", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(owner);

    expect((await logPractice(subject.id, { itemIds: ["anything"] })).status).toBe(403);
  });

  it.each([
    ["an empty list", { itemIds: [] }],
    ["a missing list", {}],
    ["ids that are not strings", { itemIds: [1, 2] }],
  ])("rejects %s", async (_label, body) => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await logPractice(subject.id, body)).status).toBe(400);
  });

  it("rejects a body that is not JSON", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);
    const response = await LOG_PRACTICE(
      rawRequest("POST", `/api/subjects/${subject.id}/checklist`, "not json"),
      routeContext({ id: subject.id })
    );

    expect(response.status).toBe(400);
  });
});
