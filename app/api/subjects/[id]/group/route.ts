import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { shareSubjectWithGroup, unshareSubjectFromGroup } from "@/lib/groups";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

const shareSchema = z.object({
  role: z.enum(["VIEWER", "EDITOR"]).default("VIEWER"),
  // Which group to share with. Left out, it is the user's own group. Admins
  // can name any group; everyone else can only name their own.
  groupId: z.string().min(1).optional(),
});

/**
 * Checks the signed-in user owns the subject and works out which group it is
 * being shared with or unshared from.
 */
async function ownerContext(subjectId: string, requestedGroupId?: string | null) {
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
    select: { role: true, group: { select: { id: true, name: true } } },
  });

  let group: { id: string; name: string } | null = user?.group ?? null;

  if (requestedGroupId && requestedGroupId !== user?.group?.id) {
    if (user?.role !== "ADMIN") {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "You can only share with your own group" },
          { status: 403 }
        ),
      };
    }
    group = await prisma.group.findUnique({
      where: { id: requestedGroupId },
      select: { id: true, name: true },
    });
    if (!group) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "That group does not exist" },
          { status: 400 }
        ),
      };
    }
  }

  if (!group) {
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
    group,
  };
}

/** Shares the subject with everyone in a group, or changes the level. */
export async function PUT(request: Request, context: RouteContext) {
  const params = await context.params;

  const body = await request.json().catch(() => ({}));
  const parsed = shareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: z.flattenError(parsed.error) },
      { status: 400 }
    );
  }

  const found = await ownerContext(params.id, parsed.data.groupId);
  if (!found.ok) return found.response;

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
    groupId: found.group.id,
    groupName: found.group.name,
  });
}

/**
 * Stops sharing the subject with a group (given as ?groupId=, otherwise the
 * user's own). Direct shares are not affected.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const params = await context.params;
  const requestedGroupId = new URL(request.url).searchParams.get("groupId");

  const found = await ownerContext(params.id, requestedGroupId);
  if (!found.ok) return found.response;

  await prisma.$transaction((tx) =>
    unshareSubjectFromGroup(tx, {
      subjectId: found.subjectId,
      groupId: found.group.id,
    })
  );

  return NextResponse.json({ shared: false, groupId: found.group.id });
}
