import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const NAME_MAX = 64;

// An empty name clears it, and the username is shown instead.
const payloadSchema = z.object({
  name: z
    .string()
    .trim()
    .max(NAME_MAX, `Name can be at most ${NAME_MAX} characters`)
    .nullable(),
});

const profileSelect = {
  username: true,
  name: true,
  group: { select: { name: true } },
} as const;

export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: profileSelect,
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    username: user.username,
    name: user.name,
    groupName: user.group?.name ?? null,
  });
}

export async function PATCH(request: Request) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 }
    );
  }

  // Only the display name can change here, never the login.
  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name || null },
    select: profileSelect,
  });

  return NextResponse.json({
    username: user.username,
    name: user.name,
    groupName: user.group?.name ?? null,
  });
}
