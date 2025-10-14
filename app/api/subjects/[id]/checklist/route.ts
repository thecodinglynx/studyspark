import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth";

const payloadSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1),
});

async function ensureParticipant(subjectId: string, userId: string) {
  return (await prisma.subject.findFirst({
    where: {
      id: subjectId,
      OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
    },
  })) as { id: string; type?: "FLASHCARDS" | "CHECKLIST" } | null;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = await ensureParticipant(params.id, session.user.id);
  if (!subject || subject.type !== "CHECKLIST") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const uniqueIds = Array.from(new Set(parsed.data.itemIds));

  if (uniqueIds.length === 0) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  const checklistClient = prisma as unknown as {
    checklistItem: {
      findMany: (args: unknown) => Promise<Array<{ id: string }>>;
    };
    checklistEntry: {
      createMany: (args: unknown) => Promise<unknown>;
    };
  };

  const validItems = await checklistClient.checklistItem.findMany({
    where: {
      id: { in: uniqueIds },
      subjectId: params.id,
    },
    select: { id: true },
  });

  if (validItems.length === 0) {
    return NextResponse.json({ error: "Invalid items" }, { status: 400 });
  }

  const now = new Date();

  await checklistClient.checklistEntry.createMany({
    data: validItems.map((item: { id: string }) => ({
      subjectId: params.id,
      itemId: item.id,
      userId: session.user.id,
      practicedAt: now,
    })),
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
