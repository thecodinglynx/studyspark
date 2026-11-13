import { NextResponse } from "next/server";
import { z } from "zod";
import { denyUnlessAdmin } from "@/lib/admin";
import { cleanGroupName } from "@/lib/groups";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

const renameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

export async function PATCH(request: Request, context: RouteContext) {
  const params = await context.params;
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: z.flattenError(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const group = await prisma.group.update({
      where: { id: params.id },
      data: { name: cleanGroupName(parsed.data.name) },
      select: { id: true, name: true },
    });
    return NextResponse.json(group);
  } catch (error) {
    if (errorCode(error) === "P2002") {
      return NextResponse.json(
        { error: "A group with that name already exists" },
        { status: 409 }
      );
    }
    if (errorCode(error) === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

/**
 * Deletes a group. Its members are left without a group, the access it gave
 * them is removed, and invite codes that pointed at it simply have no group.
 * No accounts and no subjects are deleted.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const params = await context.params;
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const removed = await prisma.group.deleteMany({ where: { id: params.id } });
  if (removed.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
