import { getCurrentSession } from "@/lib/auth";

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }
  return session.user;
}
