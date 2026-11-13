import { NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/admin";
import { cleanGroupName, groupSelect } from "@/lib/groups";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
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
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const groups = await prisma.group.findMany({
    select: groupSelect,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(groups);
}

export async function POST(request: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: z.flattenError(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const group = await prisma.group.create({
      data: { name: cleanGroupName(parsed.data.name) },
      select: groupSelect,
    });
    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A group with that name already exists" },
        { status: 409 }
      );
    }
    throw error;
  }
}
