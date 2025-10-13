import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
});

async function ensureEditor(subjectId: string, userId: string) {
  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      type: "CHECKLIST",
      OR: [
        { ownerId: userId },
        {
          shares: {
            some: {
              userId,
              role: "EDITOR",
            },
          },
        },
      ],
    },
  });

  return subject;
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = await ensureEditor(params.id, session.user.id);
  if (!subject) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const item = await prisma.checklistItem.findFirst({
    where: { id: params.itemId, subjectId: params.id },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.checklistItem.update({
    where: { id: params.itemId },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = await ensureEditor(params.id, session.user.id);
  if (!subject) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await prisma.checklistItem.findFirst({
    where: { id: params.itemId, subjectId: params.id },
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.checklistItem.delete({ where: { id: params.itemId } });

  return NextResponse.json({ ok: true });
}
