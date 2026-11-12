import { describe, expect, it } from "vitest";
import { DELETE, POST } from "@/app/api/subjects/[id]/share/route";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createFlashcardSubject,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { json, request, routeContext } from "../helpers/http";

const share = (id: string, body: unknown) =>
  POST(request("POST", `/api/subjects/${id}/share`, body), routeContext({ id }));
const unshare = (id: string, username?: string) =>
  DELETE(
    request(
      "DELETE",
      `/api/subjects/${id}/share${
        username === undefined ? "" : `?username=${encodeURIComponent(username)}`
      }`
    ),
    routeContext({ id })
  );

async function setup() {
  const owner = await createUser({ username: "owner" });
  const friend = await createUser({ username: "friend" });
  const { subject } = await createFlashcardSubject(owner.id);
  return { owner, friend, subject };
}

describe("POST /api/subjects/:id/share", () => {
  it("requires a login", async () => {
    const { subject } = await setup();

    expect((await share(subject.id, { username: "friend" })).status).toBe(401);
    expect(await prisma.subjectShare.count()).toBe(0);
  });

  it("shares with another user as a viewer by default", async () => {
    const { owner, friend, subject } = await setup();

    signInAs(owner);
    const response = await share(subject.id, { username: "friend" });

    expect(response.status).toBe(201);
    expect(await prisma.subjectShare.findMany()).toEqual([
      expect.objectContaining({ subjectId: subject.id, userId: friend.id, role: "VIEWER" }),
    ]);
  });

  it("can share with the editor role", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);
    const response = await share(subject.id, { username: "friend", role: "EDITOR" });

    expect((await json(response)).role).toBe("EDITOR");
  });

  it("changes the role when sharing again, without creating a duplicate", async () => {
    const { owner, friend, subject } = await setup();
    await shareSubject(subject.id, friend.id, "VIEWER");

    signInAs(owner);
    await share(subject.id, { username: "friend", role: "EDITOR" });

    expect(await prisma.subjectShare.findMany()).toEqual([
      expect.objectContaining({ userId: friend.id, role: "EDITOR" }),
    ]);
  });

  it("refuses to share a subject with its owner", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);
    const response = await share(subject.id, { username: "owner" });

    expect(response.status).toBe(400);
    expect((await json(response)).error).toBe("Cannot share with yourself");
  });

  it("reports an unknown username", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);
    const response = await share(subject.id, { username: "nobody" });

    expect(response.status).toBe(404);
    expect((await json(response)).error).toBe("User not found");
  });

  it("does not let an editor share the subject further", async () => {
    const { friend, subject } = await setup();
    await createUser({ username: "third" });
    await shareSubject(subject.id, friend.id, "EDITOR");

    signInAs(friend);
    const response = await share(subject.id, { username: "third" });

    expect(response.status).toBe(403);
    expect(await prisma.subjectShare.count()).toBe(1);
  });

  it("does not let an editor promote themselves", async () => {
    const { friend, subject } = await setup();
    await shareSubject(subject.id, friend.id, "VIEWER");

    signInAs(friend);
    const response = await share(subject.id, { username: "friend", role: "EDITOR" });

    expect(response.status).toBe(403);
    const stored = await prisma.subjectShare.findFirstOrThrow();
    expect(stored.role).toBe("VIEWER");
  });

  it.each([
    ["an unknown role", { username: "friend", role: "OWNER" }],
    ["a too-short username", { username: "ab" }],
    ["a missing username", { role: "VIEWER" }],
  ])("rejects %s", async (_label, body) => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await share(subject.id, body)).status).toBe(400);
    expect(await prisma.subjectShare.count()).toBe(0);
  });
});

describe("DELETE /api/subjects/:id/share", () => {
  it("requires a login", async () => {
    const { friend, subject } = await setup();
    await shareSubject(subject.id, friend.id);

    expect((await unshare(subject.id, "friend")).status).toBe(401);
    expect(await prisma.subjectShare.count()).toBe(1);
  });

  it("lets the owner remove a collaborator", async () => {
    const { owner, friend, subject } = await setup();
    await shareSubject(subject.id, friend.id);

    signInAs(owner);
    const response = await unshare(subject.id, "friend");

    expect(response.status).toBe(200);
    expect(await prisma.subjectShare.count()).toBe(0);
  });

  it("only removes the named collaborator", async () => {
    const { owner, friend, subject } = await setup();
    const other = await createUser({ username: "other" });
    await shareSubject(subject.id, friend.id);
    await shareSubject(subject.id, other.id);

    signInAs(owner);
    await unshare(subject.id, "friend");

    expect(await prisma.subjectShare.findMany()).toEqual([
      expect.objectContaining({ userId: other.id }),
    ]);
  });

  it("does not let a collaborator remove someone else's access", async () => {
    const { friend, subject } = await setup();
    const other = await createUser({ username: "other" });
    await shareSubject(subject.id, friend.id, "EDITOR");
    await shareSubject(subject.id, other.id);

    signInAs(friend);

    expect((await unshare(subject.id, "other")).status).toBe(403);
    expect(await prisma.subjectShare.count()).toBe(2);
  });

  it("requires a username", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await unshare(subject.id)).status).toBe(400);
  });

  it("reports an unknown username", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);

    expect((await unshare(subject.id, "nobody")).status).toBe(404);
  });

  it("reports a user the subject was never shared with", async () => {
    const { owner, subject } = await setup();

    signInAs(owner);
    const response = await unshare(subject.id, "friend");

    expect(response.status).toBe(404);
  });
});
