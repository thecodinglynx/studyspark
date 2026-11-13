import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The signed-in user's own group and who else is in it. Members of a group can
 * see each other; nobody can see another group.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          members: {
            select: { id: true, username: true, name: true },
            orderBy: { username: "asc" },
          },
        },
      },
    },
  });

  if (!user?.group) {
    return NextResponse.json({ group: null, members: [] });
  }

  return NextResponse.json({
    group: { id: user.group.id, name: user.group.name },
    members: user.group.members.map((member) => ({
      ...member,
      isYou: member.id === session.user.id,
    })),
  });
}
