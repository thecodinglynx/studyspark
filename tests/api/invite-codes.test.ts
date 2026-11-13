import { describe, expect, it } from "vitest";
import { DELETE } from "@/app/api/admin/invite-codes/[id]/route";
import { GET, POST } from "@/app/api/admin/invite-codes/route";
import { DELETE as DELETE_SUBJECT } from "@/app/api/subjects/[id]/route";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createAdmin,
  createFlashcardSubject,
  createInviteCode,
  createUser,
} from "../helpers/factories";
import { json, rawRequest, request, routeContext } from "../helpers/http";

const create = (body: unknown) =>
  POST(request("POST", "/api/admin/invite-codes", body));
const revoke = (id: string) =>
  DELETE(request("DELETE", `/api/admin/invite-codes/${id}`), routeContext({ id }));

type CodeBody = {
  id: string;
  code: string;
  role: string;
  maxUses: number | null;
  usedCount: number;
  subjects: Array<{ subject: { id: string; title: string } }>;
};

describe("admin access control", () => {
  it("rejects anonymous visitors", async () => {
    expect((await GET()).status).toBe(401);
    expect((await create({ subjectIds: ["x"] })).status).toBe(401);
    expect((await revoke("x")).status).toBe(401);
  });

  it("rejects regular users, even the owner of the subject", async () => {
    const user = await createUser();
    const { subject } = await createFlashcardSubject(user.id);
    signInAs(user);

    expect((await GET()).status).toBe(403);
    expect((await create({ subjectIds: [subject.id] })).status).toBe(403);
    expect((await revoke("x")).status).toBe(403);
    expect(await prisma.inviteCode.count()).toBe(0);
  });

  it("checks the role in the database, not the login token", async () => {
    // The token claims ADMIN, but the account is a regular user.
    const user = await createUser();
    signInAs({ ...user, role: "ADMIN" });

    expect((await GET()).status).toBe(403);
  });

  it("stops working as soon as the admin role is removed", async () => {
    const admin = await createAdmin();
    signInAs(admin);
    expect((await GET()).status).toBe(200);

    await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });

    expect((await GET()).status).toBe(403);
  });
});

describe("POST /api/admin/invite-codes", () => {
  it("creates a short code linked to the selected subjects", async () => {
    const admin = await createAdmin();
    const other = await createUser();
    // The subjects can belong to anyone, not just the admin.
    const { subject: a } = await createFlashcardSubject(other.id, { title: "Chemistry" });
    const { subject: b } = await createFlashcardSubject(admin.id, { title: "History" });
    await createFlashcardSubject(other.id, { title: "Not selected" });

    signInAs(admin);
    const response = await create({ subjectIds: [a.id, b.id] });

    expect(response.status).toBe(201);
    const body = await json<CodeBody>(response);
    expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(body.role).toBe("VIEWER");
    expect(body.maxUses).toBeNull();
    expect(body.usedCount).toBe(0);
    expect(body.subjects.map((s) => s.subject.title).sort()).toEqual([
      "Chemistry",
      "History",
    ]);

    const stored = await prisma.inviteCode.findUniqueOrThrow({
      where: { code: body.code },
      include: { subjects: true },
    });
    expect(stored.createdById).toBe(admin.id);
    expect(stored.subjects).toHaveLength(2);
  });

  it("can set the editor role and a signup limit", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const body = await json<CodeBody>(
      await create({ subjectIds: [subject.id], role: "EDITOR", maxUses: 5 })
    );

    expect(body).toMatchObject({ role: "EDITOR", maxUses: 5 });
  });

  it("links a subject once even if it is listed twice", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const response = await create({ subjectIds: [subject.id, subject.id] });

    expect(response.status).toBe(201);
    expect(await prisma.inviteCodeSubject.count()).toBe(1);
  });

  it("uses a code chosen by the admin, stored in capitals", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const response = await create({ subjectIds: [subject.id], code: "karateisfun" });

    expect(response.status).toBe(201);
    expect((await json<CodeBody>(response)).code).toBe("KARATEISFUN");
    expect(await prisma.inviteCode.findUnique({ where: { code: "KARATEISFUN" } })).not.toBeNull();
  });

  it("trims spaces around a chosen code", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const response = await create({ subjectIds: [subject.id], code: "  Judo2024  " });

    expect((await json<CodeBody>(response)).code).toBe("JUDO2024");
  });

  it("refuses a chosen code that is already in use, whatever its case", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);
    await createInviteCode(admin.id, [subject.id], { code: "KARATEISFUN" });

    signInAs(admin);
    const response = await create({ subjectIds: [subject.id], code: "karateisfun" });

    expect(response.status).toBe(409);
    expect((await json<{ error: string }>(response)).error).toContain("already in use");
    expect(await prisma.inviteCode.count()).toBe(1);
  });

  it("lets a chosen code be reused after the old one was revoked", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);
    const old = await createInviteCode(admin.id, [subject.id], { code: "KARATEISFUN" });

    signInAs(admin);
    await revoke(old.id);
    const response = await create({ subjectIds: [subject.id], code: "karateisfun" });

    expect(response.status).toBe(201);
  });

  it.each([
    ["too short", "abc"],
    ["too long", "a".repeat(33)],
    ["containing spaces", "karate is fun"],
    ["containing punctuation", "karate-is-fun"],
    ["containing accents", "karat\u00e9123"],
    ["empty", ""],
  ])("rejects a chosen code that is %s", async (_label, code) => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const response = await create({ subjectIds: [subject.id], code });

    expect(response.status).toBe(400);
    expect(await prisma.inviteCode.count()).toBe(0);
  });

  it("gives every code its own value", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const first = await json<CodeBody>(await create({ subjectIds: [subject.id] }));
    const second = await json<CodeBody>(await create({ subjectIds: [subject.id] }));

    expect(first.code).not.toBe(second.code);
  });

  it("refuses subjects that do not exist and creates nothing", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const response = await create({ subjectIds: [subject.id, "missing"] });

    expect(response.status).toBe(400);
    expect(await prisma.inviteCode.count()).toBe(0);
  });

  it.each([
    ["no subjects", { subjectIds: [] }],
    ["a missing subject list", {}],
    ["an unknown role", { subjectIds: ["x"], role: "OWNER" }],
    ["a zero limit", { subjectIds: ["x"], maxUses: 0 }],
    ["a fractional limit", { subjectIds: ["x"], maxUses: 1.5 }],
  ])("rejects %s", async (_label, body) => {
    signInAs(await createAdmin());

    expect((await create(body)).status).toBe(400);
    expect(await prisma.inviteCode.count()).toBe(0);
  });

  it("rejects a body that is not JSON", async () => {
    signInAs(await createAdmin());

    const response = await POST(rawRequest("POST", "/api/admin/invite-codes", "nope"));

    expect(response.status).toBe(400);
  });
});

describe("GET /api/admin/invite-codes", () => {
  it("lists codes, newest first, with usage and subjects", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id, { title: "Chemistry" });
    await createInviteCode(admin.id, [subject.id], { code: "OLDCODE2", usedCount: 3 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await createInviteCode(admin.id, [subject.id], { code: "NEWCODE2", maxUses: 10 });

    signInAs(admin);
    const body = await json<CodeBody[]>(await GET());

    expect(body.map((c) => c.code)).toEqual(["NEWCODE2", "OLDCODE2"]);
    expect(body[1]).toMatchObject({ usedCount: 3 });
    expect(body[0]).toMatchObject({ maxUses: 10 });
    expect(body[0].subjects[0].subject.title).toBe("Chemistry");
  });
});

describe("DELETE /api/admin/invite-codes/:id", () => {
  it("revokes a code", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);
    const code = await createInviteCode(admin.id, [subject.id]);

    signInAs(admin);
    const response = await revoke(code.id);

    expect(response.status).toBe(200);
    expect(await prisma.inviteCode.count()).toBe(0);
    // The subject itself is untouched.
    expect(await prisma.subject.count()).toBe(1);
  });

  it("keeps the access of people who already signed up with it", async () => {
    const admin = await createAdmin();
    const friend = await createUser();
    const { subject } = await createFlashcardSubject(admin.id);
    const code = await createInviteCode(admin.id, [subject.id]);
    await prisma.subjectShare.create({
      data: { subjectId: subject.id, userId: friend.id },
    });

    signInAs(admin);
    await revoke(code.id);

    expect(await prisma.subjectShare.count()).toBe(1);
  });

  it("returns 404 for an unknown code", async () => {
    signInAs(await createAdmin());

    expect((await revoke("missing")).status).toBe(404);
  });
});

describe("deleting a subject that has invite codes", () => {
  it("removes the subject from the code but keeps the code", async () => {
    const admin = await createAdmin();
    const { subject: doomed } = await createFlashcardSubject(admin.id);
    const { subject: kept } = await createFlashcardSubject(admin.id);
    await createInviteCode(admin.id, [doomed.id, kept.id]);

    signInAs(admin);
    const response = await DELETE_SUBJECT(
      request("DELETE", `/api/subjects/${doomed.id}`),
      routeContext({ id: doomed.id })
    );

    expect(response.status).toBe(200);
    const links = await prisma.inviteCodeSubject.findMany();
    expect(links.map((l) => l.subjectId)).toEqual([kept.id]);
    expect(await prisma.inviteCode.count()).toBe(1);
  });
});
