import { NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/admin";
import { addUserToGroup, removeUserFromGroup } from "@/lib/groups";
import { prisma } from "@/lib/prisma";

const moveSchema = z.object({
  // A group id puts the user in that group (leaving any other); null takes
  // them out of their group.
  groupId: z.string().min(1).nullable(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: z.flattenError(parsed.error) },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { groupId } = parsed.data;
  if (groupId !== null) {
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

  await prisma.$transaction(async (tx) => {
    if (groupId === null) {
      await removeUserFromGroup(tx, user.id);
    } else {
      await addUserToGroup(tx, user.id, groupId);
    }
  });

  return NextResponse.json({ id: user.id, groupId });
}
