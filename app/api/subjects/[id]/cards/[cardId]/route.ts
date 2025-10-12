import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";

const updateSchema = z.object({
  prompt: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).max(500).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: { id: string; cardId: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = await prisma.subject.findFirst({
    where: {
      id: params.id,
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
  });

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

  const existing = await prisma.card.findFirst({
    where: { id: params.cardId, subjectId: params.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.card.update({
    where: { id: params.cardId },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; cardId: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = await prisma.subject.findFirst({
    where: {
      id: params.id,
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
  });

  if (!subject) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.card.findFirst({
    where: { id: params.cardId, subjectId: params.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.card.delete({ where: { id: params.cardId } });

  return NextResponse.json({ ok: true });
}
