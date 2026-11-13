import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 };

/**
 * Decides whether the current request comes from an admin. The role is read
 * from the database on every call rather than from the login token, so
 * removing someone's admin role takes effect immediately.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return { ok: false, status: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (user?.role !== "ADMIN") {
    return { ok: false, status: 403 };
  }

  return { ok: true, userId: session.user.id };
}
