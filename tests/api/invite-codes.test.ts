import { describe, expect, it } from "vitest";
import { DELETE, PATCH } from "@/app/api/admin/invite-codes/[id]/route";
import { GET, POST } from "@/app/api/admin/invite-codes/route";
import { POST as SIGNUP } from "@/app/api/signup/route";
import { DELETE as DELETE_SUBJECT } from "@/app/api/subjects/[id]/route";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createAdmin,
  createFlashcardSubject,
  createGroup,
  createInviteCode,
  createUser,
} from "../helpers/factories";
import { json, rawRequest, request, routeContext } from "../helpers/http";

const create = (body: unknown) =>
  POST(request("POST", "/api/admin/invite-codes", body));
const revoke = (id: string) =>
  DELETE(request("DELETE", `/api/admin/invite-codes/${id}`), routeContext({ id }));

const edit = (id: string, body: unknown) =>
  PATCH(request("PATCH", `/api/admin/invite-codes/${id}`, body), routeContext({ id }));

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

describe("PATCH /api/admin/invite-codes/:id", () => {
  async function setup(options: Parameters<typeof createInviteCode>[2] = {}) {
    const admin = await createAdmin();
    const { subject: a } = await createFlashcardSubject(admin.id, { title: "Chemistry" });
    const { subject: b } = await createFlashcardSubject(admin.id, { title: "History" });
    const { subject: c } = await createFlashcardSubject(admin.id, { title: "Piano" });
    const code = await createInviteCode(admin.id, [a.id, b.id], {
      code: "KARATEISFUN",
      ...options,
    });
    return { admin, a, b, c, code };
  }

  const linkedSubjects = async (inviteCodeId: string) =>
    (await prisma.inviteCodeSubject.findMany({ where: { inviteCodeId } }))
      .map((link) => link.subjectId)
      .sort();

  it("rejects anonymous visitors and regular users", async () => {
    const { a, code } = await setup();

    expect((await edit(code.id, { subjectIds: [a.id] })).status).toBe(401);

    signInAs(await createUser());
    expect((await edit(code.id, { subjectIds: [a.id] })).status).toBe(403);

    expect(await linkedSubjects(code.id)).toHaveLength(2);
  });

  it("adds and removes subjects in one edit", async () => {
    const { admin, a, c, code } = await setup();

    signInAs(admin);
    // Keep Chemistry, drop History, add Piano.
    const response = await edit(code.id, { subjectIds: [a.id, c.id] });

    expect(response.status).toBe(200);
    const body = await json<CodeBody>(response);
    expect(body.subjects.map((s) => s.subject.title).sort()).toEqual(["Chemistry", "Piano"]);
    expect(await linkedSubjects(code.id)).toEqual([a.id, c.id].sort());
  });

  it("keeps the code itself exactly as it was", async () => {
    const { admin, a, code } = await setup();

    signInAs(admin);
    const body = await json<CodeBody>(await edit(code.id, { subjectIds: [a.id] }));

    expect(body.code).toBe("KARATEISFUN");
    expect(body.id).toBe(code.id);
    expect((await prisma.inviteCode.findUniqueOrThrow({ where: { id: code.id } })).code).toBe(
      "KARATEISFUN"
    );
  });

  it("refuses to change the code, and applies nothing else from that request", async () => {
    const { admin, c, code } = await setup();

    signInAs(admin);
    const response = await edit(code.id, { code: "NEWCODE99", subjectIds: [c.id], role: "EDITOR" });

    expect(response.status).toBe(400);
    expect((await json<{ error: string }>(response)).error).toContain("can't be changed");
    const stored = await prisma.inviteCode.findUniqueOrThrow({ where: { id: code.id } });
    expect(stored).toMatchObject({ code: "KARATEISFUN", role: "VIEWER" });
    expect(await linkedSubjects(code.id)).toHaveLength(2);
  });

  it("rejects fields it does not know about", async () => {
    const { admin, code } = await setup();

    signInAs(admin);

    expect((await edit(code.id, { usedCount: 0 })).status).toBe(400);
    expect((await edit(code.id, { createdById: "someone" })).status).toBe(400);
  });

  it("will not leave a code with no subjects", async () => {
    const { admin, code } = await setup();

    signInAs(admin);
    const response = await edit(code.id, { subjectIds: [] });

    expect(response.status).toBe(400);
    expect(await linkedSubjects(code.id)).toHaveLength(2);
  });

  it("changes nothing when one of the subjects does not exist", async () => {
    const { admin, a, c, code } = await setup({ role: "VIEWER" });

    signInAs(admin);
    const response = await edit(code.id, { subjectIds: [a.id, c.id, "missing"], role: "EDITOR" });

    expect(response.status).toBe(400);
    expect(await linkedSubjects(code.id)).toHaveLength(2);
    expect((await prisma.inviteCode.findUniqueOrThrow({ where: { id: code.id } })).role).toBe(
      "VIEWER"
    );
  });

  it("links a subject once even if it is listed twice", async () => {
    const { admin, c, code } = await setup();

    signInAs(admin);
    await edit(code.id, { subjectIds: [c.id, c.id] });

    expect(await linkedSubjects(code.id)).toEqual([c.id]);
  });

  it("can change the access level", async () => {
    const { admin, code } = await setup();

    signInAs(admin);
    const body = await json<CodeBody>(await edit(code.id, { role: "EDITOR" }));

    expect(body.role).toBe("EDITOR");
    // Subjects were not part of the edit, so they stay.
    expect(await linkedSubjects(code.id)).toHaveLength(2);
  });

  it("can set and remove the signup limit", async () => {
    const { admin, code } = await setup();

    signInAs(admin);
    expect((await json<CodeBody>(await edit(code.id, { maxUses: 10 }))).maxUses).toBe(10);
    expect((await json<CodeBody>(await edit(code.id, { maxUses: null }))).maxUses).toBeNull();
  });

  it("will not set a limit below the number of times the code was already used", async () => {
    const { admin, code } = await setup({ usedCount: 3 });

    signInAs(admin);
    const tooLow = await edit(code.id, { maxUses: 2 });

    expect(tooLow.status).toBe(400);
    expect((await json<{ error: string }>(tooLow)).error).toContain("already been used 3 times");
    expect((await edit(code.id, { maxUses: 3 })).status).toBe(200);
  });

  it("accepts an empty edit and changes nothing", async () => {
    const { admin, code } = await setup({ role: "EDITOR", maxUses: 4 });

    signInAs(admin);
    const response = await edit(code.id, {});

    expect(response.status).toBe(200);
    expect(await json<CodeBody>(response)).toMatchObject({ role: "EDITOR", maxUses: 4 });
    expect(await linkedSubjects(code.id)).toHaveLength(2);
  });

  it("returns 404 for a code that does not exist", async () => {
    const { admin, a } = await setup();

    signInAs(admin);

    expect((await edit("missing", { subjectIds: [a.id] })).status).toBe(404);
  });

  describe("people who already used the code", () => {
    const signup = (username: string) =>
      SIGNUP(
        request("POST", "/api/signup", {
          username,
          password: "secret123",
          inviteCode: "karateisfun",
        })
      );

    it("keep their access when a subject is removed, and are not given the new ones", async () => {
      const { admin, a, b, c, code } = await setup();
      const early = await json<{ id: string }>(await signup("early"));

      signInAs(admin);
      await edit(code.id, { subjectIds: [a.id, c.id] });

      const shares = await prisma.subjectShare.findMany({ where: { userId: early.id } });
      expect(shares.map((s) => s.subjectId).sort()).toEqual([a.id, b.id].sort());
    });

    it("do not change the access level they were given", async () => {
      const { admin, code } = await setup();
      const early = await json<{ id: string }>(await signup("early"));

      signInAs(admin);
      await edit(code.id, { role: "EDITOR" });

      const shares = await prisma.subjectShare.findMany({ where: { userId: early.id } });
      expect(shares.every((s) => s.role === "VIEWER")).toBe(true);
    });

    it("stay counted against the limit", async () => {
      const { admin, code } = await setup();
      await signup("early");

      signInAs(admin);
      await edit(code.id, { maxUses: 2 });

      expect((await prisma.inviteCode.findUniqueOrThrow({ where: { id: code.id } })).usedCount).toBe(
        1
      );
    });
  });

  describe("people who sign up afterwards", () => {
    it("get exactly the edited subjects and access level", async () => {
      const { admin, a, c, code } = await setup();

      signInAs(admin);
      await edit(code.id, { subjectIds: [a.id, c.id], role: "EDITOR" });

      const late = await json<{ id: string; subjectsShared: number }>(
        await SIGNUP(
          request("POST", "/api/signup", {
            username: "late",
            password: "secret123",
            inviteCode: "KARATEISFUN",
          })
        )
      );

      expect(late.subjectsShared).toBe(2);
      const shares = await prisma.subjectShare.findMany({ where: { userId: late.id } });
      expect(shares.map((s) => s.subjectId).sort()).toEqual([a.id, c.id].sort());
      expect(shares.every((s) => s.role === "EDITOR")).toBe(true);
    });

    it("are stopped by a lowered limit", async () => {
      const { admin, code } = await setup();

      signInAs(admin);
      await edit(code.id, { maxUses: 1 });
      const first = await SIGNUP(
        request("POST", "/api/signup", { username: "one", password: "secret123", inviteCode: "KARATEISFUN" })
      );
      const second = await SIGNUP(
        request("POST", "/api/signup", { username: "two", password: "secret123", inviteCode: "KARATEISFUN" })
      );

      expect(first.status).toBe(201);
      expect(second.status).toBe(400);
    });
  });
});

describe("invite code groups", () => {
  async function setup() {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);
    return { admin, subject };
  }

  const groupOf = async (codeId: string) =>
    (await prisma.inviteCode.findUniqueOrThrow({ where: { id: codeId }, include: { group: true } })).group;

  it("creates a new group named after the code by default", async () => {
    const { admin, subject } = await setup();

    signInAs(admin);
    const body = await json<CodeBody & { group: { id: string; name: string } | null }>(
      await create({ subjectIds: [subject.id], code: "karateisfun" })
    );

    expect(body.group).toEqual({ id: expect.any(String), name: "KARATEISFUN" });
    expect((await groupOf(body.id))?.name).toBe("KARATEISFUN");
    expect(await prisma.group.count()).toBe(1);
  });

  it("names a generated code's group after the code", async () => {
    const { admin, subject } = await setup();

    signInAs(admin);
    const body = await json<CodeBody & { group: { name: string } | null }>(
      await create({ subjectIds: [subject.id] })
    );

    expect(body.group?.name).toBe(body.code);
  });

  it("puts the code in an existing group when one is chosen, without making another", async () => {
    const { admin, subject } = await setup();
    const group = await createGroup("Karate club");

    signInAs(admin);
    const body = await json<CodeBody & { group: { id: string } | null }>(
      await create({ subjectIds: [subject.id], groupId: group.id })
    );

    expect(body.group?.id).toBe(group.id);
    expect(await prisma.group.count()).toBe(1);
  });

  it("can make a code with no group", async () => {
    const { admin, subject } = await setup();

    signInAs(admin);
    const body = await json<CodeBody & { group: unknown }>(
      await create({ subjectIds: [subject.id], groupId: null })
    );

    expect(body.group).toBeNull();
    expect(await prisma.group.count()).toBe(0);
  });

  it("refuses a group that does not exist and creates nothing", async () => {
    const { admin, subject } = await setup();

    signInAs(admin);
    const response = await create({ subjectIds: [subject.id], groupId: "missing" });

    expect(response.status).toBe(400);
    expect((await json<{ error: string }>(response)).error).toContain("group does not exist");
    expect(await prisma.inviteCode.count()).toBe(0);
  });

  it("reuses the group of the same name when a code is made again after being revoked", async () => {
    const { admin, subject } = await setup();
    signInAs(admin);
    const first = await json<CodeBody>(await create({ subjectIds: [subject.id], code: "karateisfun" }));
    const firstGroup = await groupOf(first.id);
    await revoke(first.id);

    const second = await json<CodeBody>(await create({ subjectIds: [subject.id], code: "karateisfun" }));

    expect((await groupOf(second.id))?.id).toBe(firstGroup?.id);
    expect(await prisma.group.count()).toBe(1);
  });

  it("changes a code's group, or removes it, without moving anyone", async () => {
    const { admin, subject } = await setup();
    const code = await createInviteCode(admin.id, [subject.id], { code: "KARATEISFUN" });
    const group = await createGroup("Karate club");
    const member = await createUser({ username: "member", groupId: group.id });

    signInAs(admin);
    expect((await json<CodeBody & { group: { id: string } }>(await edit(code.id, { groupId: group.id }))).group.id).toBe(
      group.id
    );
    expect((await json<CodeBody & { group: unknown }>(await edit(code.id, { groupId: null }))).group).toBeNull();

    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBe(group.id);
  });

  it("refuses to point a code at a group that does not exist", async () => {
    const { admin, subject } = await setup();
    const code = await createInviteCode(admin.id, [subject.id]);

    signInAs(admin);

    expect((await edit(code.id, { groupId: "missing" })).status).toBe(400);
  });

  it("leaves the group alone when an edit does not mention it", async () => {
    const { admin, subject } = await setup();
    const group = await createGroup("Karate club");
    const code = await createInviteCode(admin.id, [subject.id]);
    await prisma.inviteCode.update({ where: { id: code.id }, data: { groupId: group.id } });

    signInAs(admin);
    await edit(code.id, { role: "EDITOR" });

    expect((await groupOf(code.id))?.id).toBe(group.id);
  });

  it("keeps the group when the code is revoked, so its members are not ungrouped", async () => {
    const { admin, subject } = await setup();
    const group = await createGroup("Karate club");
    const member = await createUser({ username: "member", groupId: group.id });
    const code = await createInviteCode(admin.id, [subject.id]);
    await prisma.inviteCode.update({ where: { id: code.id }, data: { groupId: group.id } });

    signInAs(admin);
    await revoke(code.id);

    expect(await prisma.group.count()).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBe(group.id);
  });
});
