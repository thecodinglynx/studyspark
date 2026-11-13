import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/admin";
import { inviteCodeSelect } from "@/lib/invite-codes";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const admin = await checkAdmin();
  if (admin.ok) return null;
  return NextResponse.json(
    { error: admin.status === 401 ? "Unauthorized" : "Forbidden" },
    { status: admin.status }
  );
}

// The code itself is deliberately not here. It cannot be changed once created,
// because it may already have been handed out.
const updateSchema = z
  .object({
    subjectIds: z.array(z.string().min(1)).min(1).max(200).optional(),
    role: z.enum(["VIEWER", "EDITOR"]).optional(),
    maxUses: z.number().int().min(1).max(100000).nullable().optional(),
    // Where people who sign up with the code from now on are put. People who
    // already used it are not moved.
    groupId: z.string().min(1).nullable().optional(),
  })
  .strict();

/**
 * Changes what a code gives to people who sign up with it from now on. People
 * who already signed up keep exactly the access they were given: nothing is
 * added to or removed from their accounts.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const params = await context.params;
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && "code" in body) {
    return NextResponse.json(
      { error: "The code itself can't be changed. Create a new code instead." },
      { status: 400 }
    );
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: z.flattenError(parsed.error) },
      { status: 400 }
    );
  }

  const existing = await prisma.inviteCode.findUnique({
    where: { id: params.id },
    select: { usedCount: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { maxUses, role, groupId } = parsed.data;
  if (typeof groupId === "string") {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) {
      return NextResponse.json(
        { error: "That group does not exist" },
        { status: 400 }
      );
    }
  }
  if (maxUses != null && maxUses < existing.usedCount) {
    return NextResponse.json(
      {
        error: `This code has already been used ${existing.usedCount} ${
          existing.usedCount === 1 ? "time" : "times"
        }, so the limit can't be lower than that.`,
      },
      { status: 400 }
    );
  }

  const subjectIds = parsed.data.subjectIds
    ? Array.from(new Set(parsed.data.subjectIds))
    : null;
  if (subjectIds) {
    const found = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true },
    });
    if (found.length !== subjectIds.length) {
      return NextResponse.json(
        { error: "One or more subjects do not exist" },
        { status: 400 }
      );
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (subjectIds) {
        await tx.inviteCodeSubject.deleteMany({
          where: { inviteCodeId: params.id, subjectId: { notIn: subjectIds } },
        });
        await tx.inviteCodeSubject.createMany({
          data: subjectIds.map((subjectId) => ({
            inviteCodeId: params.id,
            subjectId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.inviteCode.update({
        where: { id: params.id },
        data: {
          ...(role ? { role } : {}),
          ...(maxUses !== undefined ? { maxUses } : {}),
          ...(groupId !== undefined ? { groupId } : {}),
        },
        select: inviteCodeSelect,
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    // The code was revoked while this edit was in flight.
    const isMissing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025";
    if (isMissing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const params = await context.params;
  const denied = await requireAdmin();
  if (denied) return denied;

  // Revoking a code stops future signups from using it. People who already
  // signed up with it keep the access they were given.
  const removed = await prisma.inviteCode.deleteMany({
    where: { id: params.id },
  });
  if (removed.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
