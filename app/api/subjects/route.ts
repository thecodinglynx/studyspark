import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";

const subjectSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  studyGoal: z.number().int().min(0).max(1000).default(0),
  cards: z
    .array(
      z.object({
        prompt: z.string().min(1).max(500),
        answer: z.string().min(1).max(500),
      })
    )
    .min(1),
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subjects = await prisma.subject.findMany({
    where: {
      OR: [
        { ownerId: session.user.id },
        { shares: { some: { userId: session.user.id } } },
      ],
    },
    include: {
      owner: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
      shares: {
        include: {
          user: {
            select: { id: true, username: true, name: true },
          },
        },
      },
      _count: {
        select: { cards: true, sessions: true },
      },
      sessions: {
        where: { userId: session.user.id },
        orderBy: { studiedAt: "desc" },
        take: 5,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(subjects);
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = subjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const created = await prisma.subject.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      studyGoal: parsed.data.studyGoal,
      ownerId: session.user.id,
      cards: {
        createMany: {
          data: parsed.data.cards.map(
            ({ prompt, answer }: { prompt: string; answer: string }) => ({
              prompt,
              answer,
            })
          ),
        },
      },
    },
    include: {
      cards: true,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
