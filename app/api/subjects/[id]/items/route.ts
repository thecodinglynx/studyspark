import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";

const itemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
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
        {
          shares: {
            some: {
              userId: session.user.id,
              role: "EDITOR",
            },
          },
        },
      ],
    },
    include: { _count: { select: { checklistItems: true } } },
  });

  if (!subject) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const newItem = await prisma.checklistItem.create({
    data: {
      subjectId: params.id,
      title: parsed.data.title,
      description: parsed.data.description,
      position: subject._count.checklistItems,
    },
  });

  return NextResponse.json(newItem, { status: 201 });
}
