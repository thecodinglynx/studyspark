import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";

const shareSchema = z.object({
  username: z.string().min(3).max(32),
  role: z.enum(["VIEWER", "EDITOR"]).default("VIEWER"),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = await prisma.subject.findFirst({
    where: {
      id: params.id,
      ownerId: session.user.id,
    },
  });

  if (!subject) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = shareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const userToShare = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (!userToShare) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (userToShare.id === session.user.id) {
    return NextResponse.json(
      { error: "Cannot share with yourself" },
      { status: 400 }
    );
  }

  const share = await prisma.subjectShare.upsert({
    where: {
      subjectId_userId: {
        subjectId: params.id,
        userId: userToShare.id,
      },
    },
    update: {
      role: parsed.data.role,
      // A deliberate share is kept even if the person leaves a group.
      groupId: null,
    },
    create: {
      subjectId: params.id,
      userId: userToShare.id,
      role: parsed.data.role,
    },
  });

  return NextResponse.json(share, { status: 201 });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = await prisma.subject.findFirst({
    where: {
      id: params.id,
      ownerId: session.user.id,
    },
  });

  if (!subject) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "Username is required" },
      { status: 400 }
    );
  }

  const userToShare = await prisma.user.findUnique({ where: { username } });
  if (!userToShare) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const removed = await prisma.subjectShare.deleteMany({
    where: {
      subjectId: params.id,
      userId: userToShare.id,
    },
  });

  if (removed.count === 0) {
    return NextResponse.json(
      { error: "Subject is not shared with this user" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
