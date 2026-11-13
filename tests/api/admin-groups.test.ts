import { describe, expect, it } from "vitest";
import { DELETE, PATCH } from "@/app/api/admin/groups/[id]/route";
import { GET, POST } from "@/app/api/admin/groups/route";
import { PUT } from "@/app/api/admin/users/[id]/group/route";
import { shareSubjectWithGroup } from "@/lib/groups";
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

const create = (body: unknown) => POST(request("POST", "/api/admin/groups", body));
const rename = (id: string, body: unknown) =>
  PATCH(request("PATCH", `/api/admin/groups/${id}`, body), routeContext({ id }));
const remove = (id: string) =>
  DELETE(request("DELETE", `/api/admin/groups/${id}`), routeContext({ id }));
const move = (userId: string, body: unknown) =>
  PUT(request("PUT", `/api/admin/users/${userId}/group`, body), routeContext({ id: userId }));

type GroupBody = {
  id: string;
  name: string;
  members: Array<{ id: string; username: string }>;
  _count: { inviteCodes: number; subjects: number };
};

describe("admin access control for groups", () => {
  it("rejects anonymous visitors", async () => {
    expect((await GET()).status).toBe(401);
    expect((await create({ name: "x" })).status).toBe(401);
    expect((await rename("x", { name: "y" })).status).toBe(401);
    expect((await remove("x")).status).toBe(401);
    expect((await move("x", { groupId: null })).status).toBe(401);
  });

  it("rejects regular users, including members of the group", async () => {
    const group = await createGroup("Karate club");
    const member = await createUser({ groupId: group.id });
    signInAs(member);

    expect((await GET()).status).toBe(403);
    expect((await create({ name: "x" })).status).toBe(403);
    expect((await rename(group.id, { name: "y" })).status).toBe(403);
    expect((await remove(group.id)).status).toBe(403);
    expect((await move(member.id, { groupId: null })).status).toBe(403);

    expect((await prisma.group.findUniqueOrThrow({ where: { id: group.id } })).name).toBe("Karate club");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBe(group.id);
  });
});

describe("POST /api/admin/groups", () => {
  it("creates a group with a tidy name", async () => {
    signInAs(await createAdmin());

    const response = await create({ name: "  Karate   club  " });

    expect(response.status).toBe(201);
    expect(await json<GroupBody>(response)).toMatchObject({ name: "Karate club", members: [] });
  });

  it("refuses a name that is already taken", async () => {
    await createGroup("Karate club");
    signInAs(await createAdmin());

    const response = await create({ name: "Karate club" });

    expect(response.status).toBe(409);
    expect(await prisma.group.count()).toBe(1);
  });

  it.each([
    ["empty", { name: "" }],
    ["only spaces", { name: "   " }],
    ["too long", { name: "x".repeat(61) }],
    ["missing", {}],
  ])("rejects a name that is %s", async (_label, body) => {
    signInAs(await createAdmin());

    expect((await create(body)).status).toBe(400);
    expect(await prisma.group.count()).toBe(0);
  });

  it("rejects a body that is not JSON", async () => {
    signInAs(await createAdmin());

    expect((await POST(rawRequest("POST", "/api/admin/groups", "nope"))).status).toBe(400);
  });
});

describe("GET /api/admin/groups", () => {
  it("lists groups with their members and counts", async () => {
    const group = await createGroup("Karate club");
    await createGroup("Aikido");
    await createUser({ username: "bob", groupId: group.id });
    await createUser({ username: "alice", groupId: group.id });
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);
    const code = await createInviteCode(admin.id, [subject.id]);
    await prisma.inviteCode.update({ where: { id: code.id }, data: { groupId: group.id } });

    signInAs(admin);
    const groups = await json<GroupBody[]>(await GET());

    expect(groups.map((g) => g.name)).toEqual(["Aikido", "Karate club"]);
    const karate = groups.find((g) => g.name === "Karate club")!;
    expect(karate.members.map((m) => m.username)).toEqual(["alice", "bob"]);
    expect(karate._count).toMatchObject({ inviteCodes: 1, subjects: 0 });
  });

  it("never includes password hashes", async () => {
    const group = await createGroup("Karate club");
    await createUser({ groupId: group.id });
    signInAs(await createAdmin());

    expect(await (await GET()).text()).not.toContain("passwordHash");
  });
});

describe("PATCH /api/admin/groups/:id", () => {
  it("renames a group without touching its members", async () => {
    const group = await createGroup("Karate club");
    const member = await createUser({ groupId: group.id });
    signInAs(await createAdmin());

    const response = await rename(group.id, { name: "Shotokan" });

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ id: group.id, name: "Shotokan" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBe(group.id);
  });

  it("refuses a name another group has", async () => {
    const group = await createGroup("Karate club");
    await createGroup("Aikido");
    signInAs(await createAdmin());

    expect((await rename(group.id, { name: "Aikido" })).status).toBe(409);
  });

  it("allows keeping the same name", async () => {
    const group = await createGroup("Karate club");
    signInAs(await createAdmin());

    expect((await rename(group.id, { name: "Karate club" })).status).toBe(200);
  });

  it("returns 404 for a group that does not exist and 400 for an empty name", async () => {
    const group = await createGroup("Karate club");
    signInAs(await createAdmin());

    expect((await rename("missing", { name: "x" })).status).toBe(404);
    expect((await rename(group.id, { name: "" })).status).toBe(400);
  });
});

describe("DELETE /api/admin/groups/:id", () => {
  it("removes the group, ungroups its members and takes back the access it gave", async () => {
    const group = await createGroup("Karate club");
    const owner = await createUser({ username: "owner", groupId: group.id });
    const member = await createUser({ username: "member", groupId: group.id });
    const { subject } = await createFlashcardSubject(owner.id);
    await prisma.$transaction((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "VIEWER" })
    );
    const admin = await createAdmin();
    const code = await createInviteCode(admin.id, [subject.id]);
    await prisma.inviteCode.update({ where: { id: code.id }, data: { groupId: group.id } });

    signInAs(admin);
    const response = await remove(group.id);

    expect(response.status).toBe(200);
    expect(await prisma.group.count()).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBeNull();
    expect(await prisma.subjectShare.count({ where: { userId: member.id } })).toBe(0);
    expect((await prisma.inviteCode.findUniqueOrThrow({ where: { id: code.id } })).groupId).toBeNull();
    // Nothing else is lost.
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.subject.count()).toBe(1);
  });

  it("returns 404 for a group that does not exist", async () => {
    signInAs(await createAdmin());

    expect((await remove("missing")).status).toBe(404);
  });
});

describe("PUT /api/admin/users/:id/group", () => {
  async function setup() {
    const group = await createGroup("Karate club");
    const owner = await createUser({ username: "owner", groupId: group.id });
    const { subject } = await createFlashcardSubject(owner.id, { title: "Katas" });
    await prisma.$transaction((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "EDITOR" })
    );
    const admin = await createAdmin();
    return { group, owner, subject, admin };
  }

  it("moves a user into a group and gives them what it shares", async () => {
    const { group, subject, admin } = await setup();
    const newcomer = await createUser({ username: "newcomer" });

    signInAs(admin);
    const response = await move(newcomer.id, { groupId: group.id });

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ id: newcomer.id, groupId: group.id });
    expect(await prisma.subjectShare.findMany({ where: { userId: newcomer.id } })).toEqual([
      expect.objectContaining({ subjectId: subject.id, role: "EDITOR", groupId: group.id }),
    ]);
  });

  it("moves a user out of their group and takes the access away", async () => {
    const { group, admin } = await setup();
    const member = await createUser({ username: "member" });
    signInAs(admin);
    await move(member.id, { groupId: group.id });

    const response = await move(member.id, { groupId: null });

    expect(response.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBeNull();
    expect(await prisma.subjectShare.count({ where: { userId: member.id } })).toBe(0);
  });

  it("moves a user from one group straight into another", async () => {
    const { group, subject, admin } = await setup();
    const other = await createGroup("Judo club");
    const member = await createUser({ username: "member" });
    signInAs(admin);
    await move(member.id, { groupId: group.id });

    await move(member.id, { groupId: other.id });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBe(other.id);
    expect(await prisma.subjectShare.count({ where: { userId: member.id, subjectId: subject.id } })).toBe(0);
  });

  it("stops sharing a leaving owner's subjects with the group", async () => {
    const { group, owner, admin } = await setup();
    const member = await createUser({ username: "member", groupId: group.id });
    signInAs(admin);

    await move(owner.id, { groupId: null });

    expect(await prisma.groupSubject.count()).toBe(0);
    expect(await prisma.subjectShare.count({ where: { userId: member.id } })).toBe(0);
  });

  it("can move an admin too", async () => {
    const { group, admin } = await setup();
    signInAs(admin);

    expect((await move(admin.id, { groupId: group.id })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).groupId).toBe(group.id);
  });

  it("returns 404 for an unknown user and 400 for an unknown group or bad body", async () => {
    const { group, admin } = await setup();
    const user = await createUser({ username: "someone" });
    signInAs(admin);

    expect((await move("missing", { groupId: group.id })).status).toBe(404);
    expect((await move(user.id, { groupId: "missing" })).status).toBe(400);
    expect((await move(user.id, {})).status).toBe(400);
    expect((await move(user.id, { groupId: 5 })).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).groupId).toBeNull();
  });
});
