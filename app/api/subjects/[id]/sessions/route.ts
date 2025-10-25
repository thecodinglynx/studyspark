import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";

const cardResultSchema = z.object({
  cardId: z.string().min(1),
  correct: z.number().int().min(0).max(1000),
  incorrect: z.number().int().min(0).max(1000),
});

const sessionSchema = z.object({
  correct: z.number().int().min(0).max(10000),
  incorrect: z.number().int().min(0).max(10000),
  durationMin: z.number().int().min(0).max(1440),
  cardCount: z.number().int().min(0).max(10000),
  cards: z.array(cardResultSchema).max(2000).default([]),
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

  type TransactionClient = {
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
    card: {
      findMany: (args: {
        where: { id: { in: string[] }; subjectId: string };
        select: { id: true };
      }) => Promise<Array<{ id: string }>>;
    };
    cardPerformance: {
      upsert: (args: {
        where: { cardId_userId: { cardId: string; userId: string } };
        update: {
          correctCount: { increment: number };
          incorrectCount: { increment: number };
          lastStudiedAt: Date;
        };
        create: {
          cardId: string;
          subjectId: string;
          userId: string;
          correctCount: number;
          incorrectCount: number;
          lastStudiedAt: Date;
        };
      }) => Promise<unknown>;
    };
  };

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
    card: {
      findMany: (args: {
        where: { id: { in: string[] }; subjectId: string };
        select: { id: true };
      }) => Promise<Array<{ id: string }>>;
    };
    cardPerformance: {
      upsert: (args: {
        where: { cardId_userId: { cardId: string; userId: string } };
        update: {
          correctCount: { increment: number };
          incorrectCount: { increment: number };
          lastStudiedAt: Date;
        };
        create: {
          cardId: string;
          subjectId: string;
          userId: string;
          correctCount: number;
          incorrectCount: number;
          lastStudiedAt: Date;
        };
      }) => Promise<unknown>;
    };
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  };
  const { cards } = parsed.data;

  if (cards.length > 0) {
    const totalAttempts = cards.reduce(
      (acc, result) => {
        acc.correct += result.correct;
        acc.incorrect += result.incorrect;
        return acc;
      },
      { correct: 0, incorrect: 0 }
    );

    if (
      totalAttempts.correct !== parsed.data.correct ||
      totalAttempts.incorrect !== parsed.data.incorrect
    ) {
      return NextResponse.json(
        { error: "Mismatched card totals" },
        { status: 400 }
      );
    }
  }

  const now = new Date();

  let created;
  try {
    created = await studySessionClient.$transaction(async (tx) => {
      const transaction = tx as TransactionClient;

      const sessionRecord = await transaction.studySession.create({
        data: {
          subjectId: params.id,
          userId: session.user.id,
          correct: parsed.data.correct,
          incorrect: parsed.data.incorrect,
          durationMin: parsed.data.durationMin,
          cardCount: parsed.data.cardCount,
        },
      });

      if (cards.length > 0) {
        const cardIds = cards.map((card) => card.cardId);
        const validCards = await transaction.card.findMany({
          where: { id: { in: cardIds }, subjectId: params.id },
          select: { id: true },
        });

        if (validCards.length !== cards.length) {
          throw new Error("Invalid card references");
        }

        await Promise.all(
          cards.map((card) =>
            transaction.cardPerformance.upsert({
              where: {
                cardId_userId: { cardId: card.cardId, userId: session.user.id },
              },
              update: {
                correctCount: { increment: card.correct },
                incorrectCount: { increment: card.incorrect },
                lastStudiedAt: now,
              },
              create: {
                cardId: card.cardId,
                subjectId: params.id,
                userId: session.user.id,
                correctCount: card.correct,
                incorrectCount: card.incorrect,
                lastStudiedAt: now,
              },
            })
          )
        );
      }

      return sessionRecord;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid card references") {
      return NextResponse.json(
        { error: "Invalid card references" },
        { status: 400 }
      );
    }

    console.error("Failed to record study session", error);
    return NextResponse.json(
      { error: "Failed to record session" },
      { status: 500 }
    );
  }

  revalidatePath(`/subjects/${params.id}`);
  revalidatePath("/dashboard");

  return NextResponse.json(created, { status: 201 });
}
