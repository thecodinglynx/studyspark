import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { shareSubjectWithGroup, unshareSubjectFromGroup } from "@/lib/groups";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

const shareSchema = z.object({
  role: z.enum(["VIEWER", "EDITOR"]).default("VIEWER"),
});

/**
 * Finds the signed-in user's group, and checks they own the subject. Only the
 * owner can share a subject, and only with the group they belong to.
 */
async function ownerContext(subjectId: string) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, ownerId: session.user.id },
    select: { id: true },
  });
  if (!subject) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { group: { select: { id: true, name: true } } },
  });
  if (!user?.group) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "You are not in a group" },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true as const,
    subjectId: subject.id,
    ownerId: session.user.id,
    group: user.group,
  };
}

/** Shares the subject with everyone in the owner's group, or changes the level. */
export async function PUT(request: Request, context: RouteContext) {
  const params = await context.params;
  const found = await ownerContext(params.id);
  if (!found.ok) return found.response;

  const body = await request.json().catch(() => ({}));
  const parsed = shareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: z.flattenError(parsed.error) },
      { status: 400 }
    );
  }

  await prisma.$transaction((tx) =>
    shareSubjectWithGroup(tx, {
      subjectId: found.subjectId,
      ownerId: found.ownerId,
      groupId: found.group.id,
      role: parsed.data.role,
    })
  );

  return NextResponse.json({
    shared: true,
    role: parsed.data.role,
    groupName: found.group.name,
  });
}

/** Stops sharing the subject with the group. Direct shares are not affected. */
export async function DELETE(_request: Request, context: RouteContext) {
  const params = await context.params;
  const found = await ownerContext(params.id);
  if (!found.ok) return found.response;

  await prisma.$transaction((tx) =>
    unshareSubjectFromGroup(tx, {
      subjectId: found.subjectId,
      groupId: found.group.id,
    })
  );

  return NextResponse.json({ shared: false });
}
