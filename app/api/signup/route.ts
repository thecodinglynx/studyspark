import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { normalizeInviteCode } from "@/lib/invite-codes";

const payloadSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and underscores allowed"),
  password: z.string().min(6).max(128),
  name: z.string().min(2).max(64).optional(),
  inviteCode: z.string().max(64).optional(),
});

const INVALID_INVITE = "Invalid or expired invite code";

class InvalidInviteError extends Error {}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Username already taken" },
      { status: 409 }
    );
  }

  // An invite code is checked before anything is created, so a mistyped code
  // does not leave behind an account the person did not mean to make yet.
  const submittedCode = parsed.data.inviteCode
    ? normalizeInviteCode(parsed.data.inviteCode)
    : "";
  const invite = submittedCode
    ? await prisma.inviteCode.findUnique({
        where: { code: submittedCode },
        include: { subjects: { select: { subjectId: true } } },
      })
    : null;

  if (
    submittedCode &&
    (!invite || (invite.maxUses !== null && invite.usedCount >= invite.maxUses))
  ) {
    return NextResponse.json({ error: INVALID_INVITE }, { status: 400 });
  }

  const passwordHash = await hash(parsed.data.password, 10);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: parsed.data.username,
          passwordHash,
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
        },
      });

      if (invite) {
        // Count the use first, and only if the code still has uses left. Doing
        // this in one statement stops two signups racing past maxUses.
        const claimed = await tx.$executeRaw`
          UPDATE "InviteCode"
          SET "usedCount" = "usedCount" + 1
          WHERE "id" = ${invite.id}
            AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
        `;
        if (claimed === 0) {
          throw new InvalidInviteError();
        }

        await tx.subjectShare.createMany({
          data: invite.subjects.map(({ subjectId }) => ({
            subjectId,
            userId: created.id,
            role: invite.role,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });
  } catch (error) {
    if (error instanceof InvalidInviteError) {
      return NextResponse.json({ error: INVALID_INVITE }, { status: 400 });
    }
    throw error;
  }

  return NextResponse.json(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      ...(invite ? { subjectsShared: invite.subjects.length } : {}),
    },
    { status: 201 }
  );
}
