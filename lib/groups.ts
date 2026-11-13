import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
type Role = "VIEWER" | "EDITOR";

/*
 * How group sharing works
 * -----------------------
 * Every permission check in the app asks "is this person the owner, or do they
 * have a SubjectShare for it?". Rather than teach each of those checks about
 * groups, a subject shared with a group is turned into ordinary SubjectShare
 * rows for each member, tagged with the group they came from (groupId). The
 * functions below keep those rows in step as people join and leave and as
 * subjects are shared and unshared. A share the owner or an admin made
 * directly has no groupId and is never touched here.
 *
 * Everything takes the transaction client so callers can make the change and
 * the account change atomic.
 */

/**
 * Puts a user in a group, taking them out of any group they were in, and gives
 * them access to everything the group has shared (except their own subjects).
 */
export async function addUserToGroup(tx: Tx, userId: string, groupId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { groupId: true },
  });
  if (!user) throw new Error("User not found");
  if (user.groupId === groupId) return;

  if (user.groupId) await removeUserFromGroup(tx, userId);

  await tx.user.update({ where: { id: userId }, data: { groupId } });

  const shared = await tx.groupSubject.findMany({
    where: { groupId, subject: { ownerId: { not: userId } } },
    select: { subjectId: true, role: true },
  });
  if (shared.length > 0) {
    await tx.subjectShare.createMany({
      data: shared.map((entry) => ({
        subjectId: entry.subjectId,
        userId,
        role: entry.role,
        groupId,
      })),
      // A share they already have directly wins; leave it as it is.
      skipDuplicates: true,
    });
  }
}

/**
 * Takes a user out of their group. They lose the access the group gave them,
 * and any of their own subjects stop being shared with that group.
 */
export async function removeUserFromGroup(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { groupId: true },
  });
  if (!user?.groupId) return;
  const groupId = user.groupId;

  await tx.subjectShare.deleteMany({ where: { userId, groupId } });

  const mine = await tx.groupSubject.findMany({
    where: { groupId, subject: { ownerId: userId } },
    select: { subjectId: true },
  });
  if (mine.length > 0) {
    const subjectIds = mine.map((entry) => entry.subjectId);
    await tx.subjectShare.deleteMany({
      where: { groupId, subjectId: { in: subjectIds } },
    });
    await tx.groupSubject.deleteMany({
      where: { groupId, subjectId: { in: subjectIds } },
    });
  }

  await tx.user.update({ where: { id: userId }, data: { groupId: null } });
}

/**
 * Shares a subject with every member of a group (other than its owner), now
 * and for anyone who joins later. Calling it again changes the access level.
 */
export async function shareSubjectWithGroup(
  tx: Tx,
  options: { subjectId: string; ownerId: string; groupId: string; role: Role }
) {
  const { subjectId, ownerId, groupId, role } = options;

  await tx.groupSubject.upsert({
    where: { groupId_subjectId: { groupId, subjectId } },
    create: { groupId, subjectId, role },
    update: { role },
  });

  const members = await tx.user.findMany({
    where: { groupId, id: { not: ownerId } },
    select: { id: true },
  });
  if (members.length > 0) {
    await tx.subjectShare.createMany({
      data: members.map((member) => ({
        subjectId,
        userId: member.id,
        role,
        groupId,
      })),
      skipDuplicates: true,
    });
  }

  // Members who already had it through this group move to the new level.
  await tx.subjectShare.updateMany({
    where: { subjectId, groupId },
    data: { role },
  });
}

/** Stops sharing a subject with a group. Direct shares are left alone. */
export async function unshareSubjectFromGroup(
  tx: Tx,
  options: { subjectId: string; groupId: string }
) {
  const { subjectId, groupId } = options;
  await tx.subjectShare.deleteMany({ where: { subjectId, groupId } });
  await tx.groupSubject.deleteMany({ where: { subjectId, groupId } });
}

/** What the admin API returns for a group. */
export const groupSelect = {
  id: true,
  name: true,
  createdAt: true,
  members: {
    select: { id: true, username: true, name: true },
    orderBy: { username: "asc" },
  },
  _count: { select: { inviteCodes: true, subjects: true } },
} as const;

/** Group names: trimmed, 1 to 60 characters. */
export function cleanGroupName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}
