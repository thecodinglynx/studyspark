import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAdmin } from "@/lib/admin";
import {
  generateInviteCode,
  inviteCodeSelect,
  normalizeInviteCode,
} from "@/lib/invite-codes";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  subjectIds: z.array(z.string().min(1)).min(1).max(200),
  role: z.enum(["VIEWER", "EDITOR"]).default("VIEWER"),
  maxUses: z.number().int().min(1).max(100000).nullable().optional(),
  // The group people who sign up with this code join. Left out, a new group
  // named after the code is made; null means no group.
  groupId: z.string().min(1).nullable().optional(),
  // A code the admin chose, such as "karateisfun". Left out, one is generated.
  code: z
    .string()
    .trim()
    .min(4, "Use at least 4 characters")
    .max(32, "Use at most 32 characters")
    .regex(/^[A-Za-z0-9]+$/, "Use only letters and numbers")
    .optional(),
});

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function GET() {
  const admin = await checkAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: admin.status }
    );
  }

  const codes = await prisma.inviteCode.findMany({
    select: inviteCodeSelect,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(codes);
}

export async function POST(request: Request) {
  const admin = await checkAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: admin.status }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: z.flattenError(parsed.error) },
      { status: 400 }
    );
  }

  const subjectIds = Array.from(new Set(parsed.data.subjectIds));
  const existing = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true },
  });
  if (existing.length !== subjectIds.length) {
    return NextResponse.json(
      { error: "One or more subjects do not exist" },
      { status: 400 }
    );
  }

  const requestedGroupId = parsed.data.groupId;
  if (typeof requestedGroupId === "string") {
    const group = await prisma.group.findUnique({
      where: { id: requestedGroupId },
      select: { id: true },
    });
    if (!group) {
      return NextResponse.json(
        { error: "That group does not exist" },
        { status: 400 }
      );
    }
  }

  const chosenCode = parsed.data.code
    ? normalizeInviteCode(parsed.data.code)
    : null;

  // A generated code clashing with an existing one is astronomically
  // unlikely, but the column is unique, so retry with a fresh one. A code the
  // admin chose is never replaced: a clash is reported back instead.
  for (let attempt = 0; attempt < (chosenCode ? 1 : 5); attempt += 1) {
    try {
      const code = chosenCode ?? generateInviteCode();
      const created = await prisma.$transaction(async (tx) => {
        // A new group is named after the code. If a group with that name
        // already exists (for example from a code that was revoked and is
        // being made again), it is reused rather than duplicated.
        const groupId =
          requestedGroupId === undefined
            ? (
                await tx.group.upsert({
                  where: { name: code },
                  create: { name: code },
                  update: {},
                  select: { id: true },
                })
              ).id
            : requestedGroupId;

        return tx.inviteCode.create({
          data: {
            code,
            role: parsed.data.role,
            maxUses: parsed.data.maxUses ?? null,
            groupId,
            createdById: admin.userId,
            subjects: {
              createMany: {
                data: subjectIds.map((subjectId) => ({ subjectId })),
              },
            },
          },
          select: inviteCodeSelect,
        });
      });
      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (chosenCode) {
        return NextResponse.json(
          { error: "That code is already in use. Choose a different one." },
          { status: 409 }
        );
      }
    }
  }

  return NextResponse.json(
    { error: "Could not generate a unique code, please try again" },
    { status: 500 }
  );
}
