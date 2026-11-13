import { describe, expect, it } from "vitest";
import {
  addUserToGroup,
  cleanGroupName,
  removeUserFromGroup,
  shareSubjectWithGroup,
  unshareSubjectFromGroup,
} from "@/lib/groups";
import { prisma } from "@/lib/prisma";
import {
  createFlashcardSubject,
  createGroup,
  createInviteCode,
  createAdmin,
  createUser,
  shareSubject,
} from "../helpers/factories";

const run = <T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) =>
  prisma.$transaction(fn);

const sharesOf = (userId: string) =>
  prisma.subjectShare.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

async function setup() {
  const group = await createGroup("Karate club");
  const owner = await createUser({ username: "owner", groupId: group.id });
  const member = await createUser({ username: "member", groupId: group.id });
  const { subject } = await createFlashcardSubject(owner.id, { title: "Katas" });
  return { group, owner, member, subject };
}

describe("shareSubjectWithGroup", () => {
  it("gives every other member access, tagged with the group", async () => {
    const { group, owner, member, subject } = await setup();
    const third = await createUser({ username: "third", groupId: group.id });

    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "VIEWER" })
    );

    for (const user of [member, third]) {
      expect(await sharesOf(user.id)).toEqual([
        expect.objectContaining({ subjectId: subject.id, role: "VIEWER", groupId: group.id }),
      ]);
    }
    // The owner needs no share of their own subject.
    expect(await sharesOf(owner.id)).toEqual([]);
    expect(await prisma.groupSubject.findMany()).toEqual([
      expect.objectContaining({ groupId: group.id, subjectId: subject.id, role: "VIEWER" }),
    ]);
  });

  it("does not give access to people outside the group", async () => {
    const { group, owner, subject } = await setup();
    const outsider = await createUser({ username: "outsider" });

    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "EDITOR" })
    );

    expect(await sharesOf(outsider.id)).toEqual([]);
  });

  it("changes the access level of existing members when shared again", async () => {
    const { group, owner, member, subject } = await setup();
    const share = (role: "VIEWER" | "EDITOR") =>
      run((tx) =>
        shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role })
      );

    await share("VIEWER");
    await share("EDITOR");

    expect((await sharesOf(member.id))[0].role).toBe("EDITOR");
    expect(await prisma.groupSubject.count()).toBe(1);
    expect(await prisma.subjectShare.count()).toBe(1);
  });

  it("leaves a direct share alone instead of overwriting it", async () => {
    const { group, owner, member, subject } = await setup();
    await shareSubject(subject.id, member.id, "VIEWER");

    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "EDITOR" })
    );

    expect(await sharesOf(member.id)).toEqual([
      expect.objectContaining({ role: "VIEWER", groupId: null }),
    ]);
  });
});

describe("unshareSubjectFromGroup", () => {
  it("removes the group's access but not a direct share", async () => {
    const { group, owner, member, subject } = await setup();
    const direct = await createUser({ username: "direct", groupId: group.id });
    await shareSubject(subject.id, direct.id, "VIEWER");
    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "VIEWER" })
    );

    await run((tx) => unshareSubjectFromGroup(tx, { subjectId: subject.id, groupId: group.id }));

    expect(await sharesOf(member.id)).toEqual([]);
    expect(await sharesOf(direct.id)).toHaveLength(1);
    expect(await prisma.groupSubject.count()).toBe(0);
  });
});

describe("addUserToGroup", () => {
  it("puts the user in the group and gives them what is already shared", async () => {
    const { group, owner, subject } = await setup();
    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "EDITOR" })
    );
    const newcomer = await createUser({ username: "newcomer" });

    await run((tx) => addUserToGroup(tx, newcomer.id, group.id));

    expect((await prisma.user.findUniqueOrThrow({ where: { id: newcomer.id } })).groupId).toBe(group.id);
    expect(await sharesOf(newcomer.id)).toEqual([
      expect.objectContaining({ subjectId: subject.id, role: "EDITOR", groupId: group.id }),
    ]);
  });

  it("does not give someone a share of their own subject", async () => {
    const group = await createGroup();
    const owner = await createUser({ username: "owner" });
    const { subject } = await createFlashcardSubject(owner.id);
    await run((tx) => addUserToGroup(tx, owner.id, group.id));
    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "VIEWER" })
    );
    await run((tx) => removeUserFromGroup(tx, owner.id));
    await createGroup("other");

    // Re-join: they own the subject, so no share is created for them.
    await run((tx) => addUserToGroup(tx, owner.id, group.id));

    expect(await sharesOf(owner.id)).toEqual([]);
  });

  it("does nothing when the user is already in the group", async () => {
    const { group, member } = await setup();

    await run((tx) => addUserToGroup(tx, member.id, group.id));

    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBe(group.id);
  });

  it("moves a user out of their old group, taking that group's access away", async () => {
    const { group, owner, member, subject } = await setup();
    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "VIEWER" })
    );
    const other = await createGroup("Judo club");
    const otherOwner = await createUser({ username: "judoka", groupId: other.id });
    const { subject: judo } = await createFlashcardSubject(otherOwner.id, { title: "Throws" });
    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: judo.id, ownerId: otherOwner.id, groupId: other.id, role: "VIEWER" })
    );

    await run((tx) => addUserToGroup(tx, member.id, other.id));

    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBe(other.id);
    expect((await sharesOf(member.id)).map((s) => s.subjectId)).toEqual([judo.id]);
  });

  it("keeps a direct share when moving between groups", async () => {
    const { group, member } = await setup();
    const other = await createGroup("Judo club");
    const friend = await createUser({ username: "friend" });
    const { subject } = await createFlashcardSubject(friend.id);
    await shareSubject(subject.id, member.id, "EDITOR");

    await run((tx) => addUserToGroup(tx, member.id, other.id));

    expect(await sharesOf(member.id)).toEqual([
      expect.objectContaining({ subjectId: subject.id, groupId: null }),
    ]);
    expect(group.id).not.toBe(other.id);
  });
});

describe("removeUserFromGroup", () => {
  it("ungroups the user and removes only the access the group gave", async () => {
    const { group, owner, member, subject } = await setup();
    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "VIEWER" })
    );
    const friend = await createUser({ username: "friend" });
    const { subject: direct } = await createFlashcardSubject(friend.id);
    await shareSubject(direct.id, member.id, "VIEWER");

    await run((tx) => removeUserFromGroup(tx, member.id));

    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBeNull();
    expect((await sharesOf(member.id)).map((s) => s.subjectId)).toEqual([direct.id]);
  });

  it("stops sharing the leaving user's own subjects with the group", async () => {
    const { group, owner, member, subject } = await setup();
    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "VIEWER" })
    );

    await run((tx) => removeUserFromGroup(tx, owner.id));

    expect(await sharesOf(member.id)).toEqual([]);
    expect(await prisma.groupSubject.count()).toBe(0);
    // The subject itself is untouched.
    expect(await prisma.subject.count({ where: { id: subject.id } })).toBe(1);
  });

  it("does nothing for someone who has no group", async () => {
    const loner = await createUser({ username: "loner" });

    await run((tx) => removeUserFromGroup(tx, loner.id));

    expect((await prisma.user.findUniqueOrThrow({ where: { id: loner.id } })).groupId).toBeNull();
  });
});

describe("deleting a group", () => {
  it("ungroups members, removes group access and unlinks invite codes", async () => {
    const { group, owner, member, subject } = await setup();
    await run((tx) =>
      shareSubjectWithGroup(tx, { subjectId: subject.id, ownerId: owner.id, groupId: group.id, role: "VIEWER" })
    );
    const admin = await createAdmin();
    const code = await createInviteCode(admin.id, [subject.id], { code: "KARATEISFUN" });
    await prisma.inviteCode.update({ where: { id: code.id }, data: { groupId: group.id } });

    await prisma.group.delete({ where: { id: group.id } });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).groupId).toBeNull();
    expect(await sharesOf(member.id)).toEqual([]);
    expect(await prisma.groupSubject.count()).toBe(0);
    expect((await prisma.inviteCode.findUniqueOrThrow({ where: { id: code.id } })).groupId).toBeNull();
    // Nobody lost an account or a subject.
    expect(await prisma.user.count()).toBe(3);
    expect(await prisma.subject.count()).toBe(1);
  });
});

describe("cleanGroupName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanGroupName("  Karate    club  ")).toBe("Karate club");
  });
});
