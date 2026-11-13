import { describe, expect, it } from "vitest";
import { GET as GET_GROUP } from "@/app/api/group/route";
import { DELETE, PUT } from "@/app/api/subjects/[id]/group/route";
import { GET as GET_SUBJECT } from "@/app/api/subjects/[id]/route";
import { GET as GET_SUBJECTS } from "@/app/api/subjects/route";
import { POST as ADD_CARD } from "@/app/api/subjects/[id]/cards/route";
import { prisma } from "@/lib/prisma";
import { signInAs, signOut } from "../helpers/auth";
import {
  createAdmin,
  createFlashcardSubject,
  createGroup,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { json, rawRequest, request, routeContext } from "../helpers/http";

const share = (id: string, body?: unknown) =>
  PUT(request("PUT", `/api/subjects/${id}/group`, body), routeContext({ id }));
const unshare = (id: string) =>
  DELETE(request("DELETE", `/api/subjects/${id}/group`), routeContext({ id }));
const read = (id: string) =>
  GET_SUBJECT(request("GET", `/api/subjects/${id}`), routeContext({ id }));
const addCard = (id: string) =>
  ADD_CARD(request("POST", `/api/subjects/${id}/cards`, { prompt: "q", answer: "a" }), routeContext({ id }));

type GroupBody = {
  group: { id: string; name: string } | null;
  members: Array<{ id: string; username: string; name: string | null; isYou: boolean }>;
};

async function setup() {
  const group = await createGroup("Karate club");
  const owner = await createUser({ username: "owner", groupId: group.id });
  const alice = await createUser({ username: "alice", name: "Alice A", groupId: group.id });
  const bob = await createUser({ username: "bob", groupId: group.id });
  const outsider = await createUser({ username: "outsider" });
  const { subject } = await createFlashcardSubject(owner.id, { title: "Katas" });
  return { group, owner, alice, bob, outsider, subject };
}

describe("GET /api/group", () => {
  it("requires a login", async () => {
    expect((await GET_GROUP()).status).toBe(401);
  });

  it("lets a member see their group and who is in it, marking themselves", async () => {
    const { group, alice } = await setup();

    signInAs(alice);
    const body = await json<GroupBody>(await GET_GROUP());

    expect(body.group).toEqual({ id: group.id, name: "Karate club" });
    expect(body.members.map((m) => [m.username, m.isYou])).toEqual([
      ["alice", true],
      ["bob", false],
      ["owner", false],
    ]);
    expect(body.members[0].name).toBe("Alice A");
  });

  it("does not show members of other groups, or people with no group", async () => {
    const { alice } = await setup();
    const other = await createGroup("Judo club");
    await createUser({ username: "judoka", groupId: other.id });

    signInAs(alice);
    const text = await (await GET_GROUP()).text();

    expect(text).not.toContain("judoka");
    expect(text).not.toContain("outsider");
    expect(text).not.toContain("Judo club");
  });

  it("exposes nothing sensitive about the members", async () => {
    const { alice } = await setup();

    signInAs(alice);
    const text = await (await GET_GROUP()).text();

    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("email");
  });

  it("says there is no group for someone without one", async () => {
    const { outsider } = await setup();

    signInAs(outsider);

    expect(await json(await GET_GROUP())).toEqual({ group: null, members: [] });
  });

  it("says there is no group for an admin who is not in one", async () => {
    await setup();

    signInAs(await createAdmin());

    expect((await json<GroupBody>(await GET_GROUP())).group).toBeNull();
  });
});

describe("PUT /api/subjects/:id/group", () => {
  it("requires a login", async () => {
    const { subject } = await setup();

    expect((await share(subject.id)).status).toBe(401);
  });

  it("shares the subject with every other member as a viewer by default", async () => {
    const { owner, alice, bob, subject } = await setup();

    signInAs(owner);
    const response = await share(subject.id);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ shared: true, role: "VIEWER", groupName: "Karate club" });

    for (const member of [alice, bob]) {
      signInAs(member);
      expect((await read(subject.id)).status).toBe(200);
      const listed = await json<Array<{ id: string }>>(await GET_SUBJECTS());
      expect(listed.map((s) => s.id)).toContain(subject.id);
    }
  });

  it("does not give access to people outside the group", async () => {
    const { owner, outsider, subject } = await setup();
    signInAs(owner);
    await share(subject.id);

    signInAs(outsider);

    expect((await read(subject.id)).status).toBe(404);
  });

  it("lets members edit only when shared as editor", async () => {
    const { owner, alice, subject } = await setup();
    signInAs(owner);
    await share(subject.id, { role: "VIEWER" });

    signInAs(alice);
    expect((await addCard(subject.id)).status).toBe(403);

    signInAs(owner);
    await share(subject.id, { role: "EDITOR" });

    signInAs(alice);
    expect((await addCard(subject.id)).status).toBe(201);
  });

  it("gives people who join the group later access too", async () => {
    const { group, owner, subject } = await setup();
    signInAs(owner);
    await share(subject.id);
    const late = await createUser({ username: "late" });
    await prisma.$transaction(async (tx) => {
      const { addUserToGroup } = await import("@/lib/groups");
      await addUserToGroup(tx, late.id, group.id);
    });

    signInAs(late);

    expect((await read(subject.id)).status).toBe(200);
  });

  it("does not let a member share someone else's subject", async () => {
    const { alice, subject } = await setup();

    signInAs(alice);

    expect((await share(subject.id)).status).toBe(403);
    expect(await prisma.groupSubject.count()).toBe(0);
  });

  it("does not let an editor share it either", async () => {
    const { group, owner, alice, subject } = await setup();
    signInAs(owner);
    await share(subject.id, { role: "EDITOR" });

    signInAs(alice);

    expect((await share(subject.id)).status).toBe(403);
    expect(group.id).toBeTruthy();
  });

  it("refuses when the owner is not in a group", async () => {
    const loner = await createUser({ username: "loner" });
    const { subject } = await createFlashcardSubject(loner.id);

    signInAs(loner);
    const response = await share(subject.id);

    expect(response.status).toBe(400);
    expect((await json<{ error: string }>(response)).error).toBe("You are not in a group");
  });

  it("returns 403 for a subject that does not exist", async () => {
    const { owner } = await setup();

    signInAs(owner);

    expect((await share("missing")).status).toBe(403);
  });

  it.each([
    ["an unknown role", { role: "OWNER" }],
    ["a role that is not text", { role: 3 }],
  ])("rejects %s", async (_label, body) => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await share(subject.id, body)).status).toBe(400);
    expect(await prisma.groupSubject.count()).toBe(0);
  });

  it("treats a missing body as the default level", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);
    const response = await PUT(
      rawRequest("PUT", `/api/subjects/${subject.id}/group`, ""),
      routeContext({ id: subject.id })
    );

    expect(response.status).toBe(200);
  });

  it("is safe to repeat", async () => {
    const { owner, subject } = await setup();
    signInAs(owner);

    await share(subject.id);
    await share(subject.id);

    expect(await prisma.groupSubject.count()).toBe(1);
    expect(await prisma.subjectShare.count({ where: { subjectId: subject.id } })).toBe(2);
  });

  it("does not downgrade a direct share a member already had", async () => {
    const { owner, alice, subject } = await setup();
    await shareSubject(subject.id, alice.id, "EDITOR");

    signInAs(owner);
    await share(subject.id, { role: "VIEWER" });

    const stored = await prisma.subjectShare.findFirstOrThrow({ where: { userId: alice.id } });
    expect(stored).toMatchObject({ role: "EDITOR", groupId: null });
  });
});

describe("DELETE /api/subjects/:id/group", () => {
  it("stops sharing: members lose access, the owner keeps the subject", async () => {
    const { owner, alice, subject } = await setup();
    signInAs(owner);
    await share(subject.id);

    const response = await unshare(subject.id);

    expect(response.status).toBe(200);
    signInAs(alice);
    expect((await read(subject.id)).status).toBe(404);
    signInAs(owner);
    expect((await read(subject.id)).status).toBe(200);
  });

  it("leaves a member's direct share alone", async () => {
    const { owner, alice, subject } = await setup();
    await shareSubject(subject.id, alice.id, "VIEWER");
    signInAs(owner);
    await share(subject.id);

    await unshare(subject.id);

    signInAs(alice);
    expect((await read(subject.id)).status).toBe(200);
  });

  it("does not let a member stop the owner's sharing", async () => {
    const { owner, alice, subject } = await setup();
    signInAs(owner);
    await share(subject.id);

    signInAs(alice);

    expect((await unshare(subject.id)).status).toBe(403);
    expect(await prisma.groupSubject.count()).toBe(1);
  });

  it("requires a login", async () => {
    const { subject } = await setup();
    signOut();

    expect((await unshare(subject.id)).status).toBe(401);
  });
});
