import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/signup/route";
import { prisma } from "@/lib/prisma";
import {
  createAdmin,
  createFlashcardSubject,
  createInviteCode,
  createUser,
} from "../helpers/factories";
import { json, request } from "../helpers/http";

const signup = (body: unknown) => POST(request("POST", "/api/signup", body));
const base = { username: "newbie", password: "secret123" };

async function setup(options: Parameters<typeof createInviteCode>[2] = {}) {
  const admin = await createAdmin();
  const { subject: a } = await createFlashcardSubject(admin.id, { title: "Chemistry" });
  const { subject: b } = await createFlashcardSubject(admin.id, { title: "History" });
  const { subject: other } = await createFlashcardSubject(admin.id, { title: "Other" });
  const invite = await createInviteCode(admin.id, [a.id, b.id], {
    code: "JOINUS23",
    ...options,
  });
  return { admin, a, b, other, invite };
}

describe("signing up with an invite code", () => {
  it("gives the new user access to exactly the code's subjects", async () => {
    const { a, b } = await setup();

    const response = await signup({ ...base, inviteCode: "JOINUS23" });

    expect(response.status).toBe(201);
    const body = await json<{ id: string; subjectsShared: number }>(response);
    expect(body.subjectsShared).toBe(2);

    const shares = await prisma.subjectShare.findMany({ where: { userId: body.id } });
    expect(shares.map((s) => s.subjectId).sort()).toEqual([a.id, b.id].sort());
    expect(shares.every((s) => s.role === "VIEWER")).toBe(true);
  });

  it("uses the access level chosen for the code", async () => {
    await setup({ role: "EDITOR" });

    const body = await json<{ id: string }>(
      await signup({ ...base, inviteCode: "JOINUS23" })
    );

    const shares = await prisma.subjectShare.findMany({ where: { userId: body.id } });
    expect(shares.every((s) => s.role === "EDITOR")).toBe(true);
  });

  it("accepts the code in any case with stray spaces", async () => {
    await setup();

    const response = await signup({ ...base, inviteCode: "  joinus23 " });

    expect(response.status).toBe(201);
    expect(await prisma.subjectShare.count()).toBe(2);
  });

  it("works with a code the admin chose, however the guest types it", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);
    await createInviteCode(admin.id, [subject.id], { code: "KARATEISFUN" });

    for (const [username, typed] of [
      ["guest1", "karateisfun"],
      ["guest2", "KarateIsFun"],
      ["guest3", " KARATEISFUN "],
    ]) {
      const response = await signup({ username, password: "secret123", inviteCode: typed });
      expect(response.status).toBe(201);
    }
    expect(await prisma.subjectShare.count()).toBe(3);
  });

  it("counts each signup against the code", async () => {
    const { invite } = await setup();

    await signup({ username: "first", password: "secret123", inviteCode: "JOINUS23" });
    await signup({ username: "second", password: "secret123", inviteCode: "JOINUS23" });

    const stored = await prisma.inviteCode.findUniqueOrThrow({ where: { id: invite.id } });
    expect(stored.usedCount).toBe(2);
  });

  it("does not make the new user an admin or the owner of anything", async () => {
    await setup();

    const body = await json<{ id: string }>(
      await signup({ ...base, inviteCode: "JOINUS23" })
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { id: body.id } });
    expect(user.role).toBe("USER");
    expect(await prisma.subject.count({ where: { ownerId: body.id } })).toBe(0);
  });

  it("stops once the maximum number of signups is reached", async () => {
    await setup({ maxUses: 1 });

    const first = await signup({ username: "first", password: "secret123", inviteCode: "JOINUS23" });
    const second = await signup({ username: "second", password: "secret123", inviteCode: "JOINUS23" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(400);
    expect((await json(second)).error).toBe("Invalid or expired invite code");
    expect(await prisma.user.findUnique({ where: { username: "second" } })).toBeNull();
  });

  it("refuses a code that has already used up its signups", async () => {
    await setup({ maxUses: 2, usedCount: 2 });

    const response = await signup({ ...base, inviteCode: "JOINUS23" });

    expect(response.status).toBe(400);
  });

  it("does not let concurrent signups go past the limit", async () => {
    const { invite } = await setup({ maxUses: 1 });

    const results = await Promise.all(
      ["racer1", "racer2", "racer3"].map((username) =>
        signup({ username, password: "secret123", inviteCode: "JOINUS23" })
      )
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const stored = await prisma.inviteCode.findUniqueOrThrow({ where: { id: invite.id } });
    expect(stored.usedCount).toBe(1);
    // Failed attempts leave no account behind.
    expect(await prisma.user.count({ where: { username: { startsWith: "racer" } } })).toBe(1);
  });

  it("rejects an unknown code without creating an account", async () => {
    await setup();

    const response = await signup({ ...base, inviteCode: "WRONG234" });

    expect(response.status).toBe(400);
    expect((await json(response)).error).toBe("Invalid or expired invite code");
    expect(await prisma.user.findUnique({ where: { username: "newbie" } })).toBeNull();
  });

  it("rejects a revoked code", async () => {
    const { invite } = await setup();
    await prisma.inviteCode.delete({ where: { id: invite.id } });

    const response = await signup({ ...base, inviteCode: "JOINUS23" });

    expect(response.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { username: "newbie" } })).toBeNull();
  });

  it("only grants subjects that still exist when the code is used", async () => {
    const { a, b } = await setup();
    await prisma.card.deleteMany({ where: { subjectId: b.id } });
    await prisma.subject.delete({ where: { id: b.id } });

    const body = await json<{ id: string; subjectsShared: number }>(
      await signup({ ...base, inviteCode: "JOINUS23" })
    );

    expect(body.subjectsShared).toBe(1);
    const shares = await prisma.subjectShare.findMany({ where: { userId: body.id } });
    expect(shares.map((s) => s.subjectId)).toEqual([a.id]);
  });

  it("still reports a taken username and does not use up the code", async () => {
    const { invite } = await setup();
    await createUser({ username: "newbie" });

    const response = await signup({ ...base, inviteCode: "JOINUS23" });

    expect(response.status).toBe(409);
    const stored = await prisma.inviteCode.findUniqueOrThrow({ where: { id: invite.id } });
    expect(stored.usedCount).toBe(0);
  });

  it("still validates the rest of the form", async () => {
    const { invite } = await setup();

    const response = await signup({ username: "ab", password: "x", inviteCode: "JOINUS23" });

    expect(response.status).toBe(400);
    const stored = await prisma.inviteCode.findUniqueOrThrow({ where: { id: invite.id } });
    expect(stored.usedCount).toBe(0);
  });

  it("treats a blank code as no code", async () => {
    await setup();

    const response = await signup({ ...base, inviteCode: "   " });

    expect(response.status).toBe(201);
    expect(await prisma.subjectShare.count()).toBe(0);
  });

  it("gives the same answer for a used-up code and one that never existed", async () => {
    await setup({ maxUses: 1, usedCount: 1 });

    const used = await json(await signup({ ...base, inviteCode: "JOINUS23" }));
    const unknown = await json(await signup({ ...base, inviteCode: "NOSUCH23" }));

    expect(used).toEqual(unknown);
  });
});
