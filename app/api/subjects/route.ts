import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";

const baseSubjectSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  studyGoal: z.number().int().min(0).max(1000).default(0).optional(),
});

const flashcardSubjectSchema = baseSubjectSchema.extend({
  type: z.literal("FLASHCARDS"),
  cards: z
    .array(
      z.object({
        prompt: z.string().min(1).max(500),
        answer: z.string().min(1).max(500),
      })
    )
    .min(1),
});

const checklistSubjectSchema = baseSubjectSchema.extend({
  type: z.literal("CHECKLIST"),
  items: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(500).optional(),
      })
    )
    .min(1),
});

const subjectSchema = z.discriminatedUnion("type", [
  flashcardSubjectSchema,
  checklistSubjectSchema,
]);

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
        select: {
          cards: true,
          sessions: true,
          checklistItems: true,
          checklistEntries: true,
        },
      },
      sessions: {
        where: { userId: session.user.id },
        orderBy: { studiedAt: "desc" },
        take: 5,
      },
      checklistEntries: {
        where: { userId: session.user.id },
        orderBy: { practicedAt: "desc" },
        take: 5,
        include: {
          item: { select: { id: true, title: true } },
        },
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

  const subjectData = {
    title: parsed.data.title,
    description: parsed.data.description,
    studyGoal: parsed.data.studyGoal ?? 0,
    ownerId: session.user.id,
    type: parsed.data.type,
  } as const;

  const created = await prisma.subject.create({
    data:
      parsed.data.type === "FLASHCARDS"
        ? {
            ...subjectData,
            cards: {
              createMany: {
                data: parsed.data.cards.map(({ prompt, answer }) => ({
                  prompt,
                  answer,
                })),
              },
            },
          }
        : {
            ...subjectData,
            checklistItems: {
              createMany: {
                data: parsed.data.items.map((item, index) => ({
                  title: item.title,
                  description: item.description,
                  position: index,
                })),
              },
            },
          },
    include: {
      cards: true,
      checklistItems: true,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
