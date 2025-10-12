import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";

const cardSchema = z.object({
  prompt: z.string().min(1).max(500),
  answer: z.string().min(1).max(500),
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
  const parsed = cardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const card = await prisma.card.create({
    data: {
      subjectId: params.id,
      prompt: parsed.data.prompt,
      answer: parsed.data.answer,
    },
  });

  return NextResponse.json(card, { status: 201 });
}
