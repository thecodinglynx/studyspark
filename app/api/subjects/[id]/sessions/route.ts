import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";

const sessionSchema = z.object({
  correct: z.number().int().min(0).max(10000),
  incorrect: z.number().int().min(0).max(10000),
  durationMin: z.number().int().min(0).max(1440),
  cardCount: z.number().int().min(0).max(10000),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subjectAccess = await prisma.subject.findFirst({
    where: {
      id: params.id,
      OR: [
        { ownerId: session.user.id },
        { shares: { some: { userId: session.user.id } } },
      ],
    },
  });

  if (!subjectAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = await prisma.studySession.findMany({
    where: {
      subjectId: params.id,
      userId: session.user.id,
    },
    orderBy: { studiedAt: "desc" },
    take: 100,
  });

  const totals = sessions.reduce<{
    correct: number;
    incorrect: number;
    durationMin: number;
    count: number;
  }>(
    (
      acc,
      curr: { correct: number; incorrect: number; durationMin: number }
    ) => {
      acc.correct += curr.correct;
      acc.incorrect += curr.incorrect;
      acc.durationMin += curr.durationMin;
      acc.count += 1;
      return acc;
    },
    { correct: 0, incorrect: 0, durationMin: 0, count: 0 }
  );

  return NextResponse.json({ sessions, totals });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subjectAccess = await prisma.subject.findFirst({
    where: {
      id: params.id,
      OR: [
        { ownerId: session.user.id },
        { shares: { some: { userId: session.user.id } } },
      ],
    },
  });

  if (!subjectAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const studySessionClient = prisma as unknown as {
    studySession: {
      create: (args: {
        data: {
          subjectId: string;
          userId: string;
          correct: number;
          incorrect: number;
          durationMin: number;
          cardCount: number;
        };
      }) => Promise<unknown>;
    };
  };

  const created = await studySessionClient.studySession.create({
    data: {
      subjectId: params.id,
      userId: session.user.id,
      correct: parsed.data.correct,
      incorrect: parsed.data.incorrect,
      durationMin: parsed.data.durationMin,
      cardCount: parsed.data.cardCount,
    },
  });

  revalidatePath(`/subjects/${params.id}`);
  revalidatePath("/dashboard");

  return NextResponse.json(created, { status: 201 });
}
