import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";

export async function POST(
  _request: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = await prisma.subject.findFirst({
    where: {
      id: params.id,
      type: "CHECKLIST",
      OR: [
        { ownerId: session.user.id },
        { shares: { some: { userId: session.user.id } } },
      ],
    },
  });

  if (!subject) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await prisma.checklistItem.findFirst({
    where: { id: params.itemId, subjectId: params.id },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const entry = await prisma.checklistEntry.create({
    data: {
      subjectId: params.id,
      itemId: params.itemId,
      userId: session.user.id,
    },
    include: {
      item: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
