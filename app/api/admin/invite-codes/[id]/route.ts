import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const admin = await checkAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: admin.status }
    );
  }

  // Revoking a code stops future signups from using it. People who already
  // signed up with it keep the access they were given.
  const removed = await prisma.inviteCode.deleteMany({
    where: { id: params.id },
  });
  if (removed.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
