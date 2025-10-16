import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  }>((acc, curr) => {
    acc.correct += curr.correct;
    acc.incorrect += curr.incorrect;
    acc.durationMin += curr.durationMin;
    acc.count += 1;
    return acc;
  }, { correct: 0, incorrect: 0, durationMin: 0, count: 0 });

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

  const { cards } = parsed.data;

  if (cards.length > 0) {
    const totals = cards.reduce(
      (acc, result) => {
        acc.correct += result.correct;
        acc.incorrect += result.incorrect;
        return acc;
      },
      { correct: 0, incorrect: 0 }
    );

    if (
      totals.correct !== parsed.data.correct ||
      totals.incorrect !== parsed.data.incorrect
    ) {
      return NextResponse.json(
        { error: "Mismatched card totals" },
        { status: 400 }
      );
    }
  }

  const now = new Date();
  const subjectId = params.id;
  const userId = session.user.id;

  const sessionPayload = {
    subjectId,
    userId,
    correct: parsed.data.correct,
    incorrect: parsed.data.incorrect,
    durationMin: parsed.data.durationMin,
    cardCount: parsed.data.cardCount,
  };

  try {
    const createdSession = await prisma.$transaction(async (tx) => {
      const transactionClient = tx as Record<string, unknown>;
      const cardPerformanceClient = transactionClient.cardPerformance as
        | {
            upsert: (...args: unknown[]) => Promise<unknown>;
          }
        | undefined;
      const sessionRecord = await tx.studySession.create({
        data: sessionPayload,
      });

      if (cards.length > 0) {
        const cardIds = cards.map((card) => card.cardId);
        const validCards = await tx.card.findMany({
          where: { id: { in: cardIds }, subjectId },
          select: { id: true },
        });

        if (validCards.length !== cards.length) {
          throw new Error("Invalid card references");
        }

        if (!cardPerformanceClient) {
          throw new Error("CardPerformance model is not available");
        }

        await Promise.all(
          cards.map((card) =>
            cardPerformanceClient.upsert({
              where: {
                cardId_userId: { cardId: card.cardId, userId },
              },
              update: {
                correctCount: { increment: card.correct },
                incorrectCount: { increment: card.incorrect },
                lastStudiedAt: now,
              },
              create: {
                cardId: card.cardId,
                subjectId,
                userId,
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

    revalidatePath(`/subjects/${subjectId}`);
    revalidatePath("/dashboard");

    return NextResponse.json(createdSession, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid card references") {
      return NextResponse.json(
        { error: "Invalid card references" },
        { status: 400 }
      );
    }

    if (
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2021") ||
      (error instanceof Error &&
        error.message === "CardPerformance model is not available")
    ) {
      console.warn(
        "CardPerformance table missing; recording session without per-card stats"
      );

      if (cards.length > 0) {
        const cardIds = cards.map((card) => card.cardId);
        const validCards = await prisma.card.findMany({
          where: { id: { in: cardIds }, subjectId },
          select: { id: true },
        });

        if (validCards.length !== cards.length) {
          return NextResponse.json(
            { error: "Invalid card references" },
            { status: 400 }
          );
        }
      }

      const fallbackSession = await prisma.studySession.create({
        data: sessionPayload,
      });

      revalidatePath(`/subjects/${subjectId}`);
      revalidatePath("/dashboard");

      return NextResponse.json(fallbackSession, { status: 201 });
    }

    console.error("Failed to record study session", error);
    return NextResponse.json(
      { error: "Failed to record session" },
      { status: 500 }
    );
  }
}
