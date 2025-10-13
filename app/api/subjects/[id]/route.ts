import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";

const updateSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  studyGoal: z.number().int().min(0).max(1000).optional(),
});

async function canAccessSubject(userId: string, subjectId: string) {
  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
    },
  });
  return subject;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeConfig = {
    cards: {
      orderBy: { createdAt: "asc" },
    },
    checklistItems: {
      orderBy: { position: "asc" },
      include: {
        entries: {
          where: { userId: session.user.id },
          orderBy: { practicedAt: "desc" },
          take: 5,
        },
      },
    },
    owner: {
      select: { id: true, username: true, name: true },
    },
    shares: {
      include: { user: { select: { id: true, username: true, name: true } } },
    },
    sessions: {
      where: { userId: session.user.id },
      orderBy: { studiedAt: "desc" },
      take: 20,
    },
    checklistEntries: {
      where: { userId: session.user.id },
      orderBy: { practicedAt: "desc" },
      take: 20,
      include: {
        item: { select: { id: true, title: true } },
      },
    },
  } as const;

  const subject = await prisma.subject.findFirst({
    where: {
      id: params.id,
      OR: [
        { ownerId: session.user.id },
        { shares: { some: { userId: session.user.id } } },
      ],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    include: includeConfig as any,
  });

  if (!subject) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(subject);
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authorized = await canAccessSubject(session.user.id, params.id);
  if (!authorized || authorized.ownerId !== session.user.id) {
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
  const updated = await prisma.subject.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authorized = await canAccessSubject(session.user.id, params.id);
  if (!authorized || authorized.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.subject.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
