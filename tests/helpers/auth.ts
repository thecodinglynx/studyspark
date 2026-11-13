import { vi } from "vitest";
import { getCurrentSession } from "@/lib/auth";

type SessionUser = {
  id: string;
  username: string;
  name?: string | null;
  role?: "USER" | "ADMIN";
};

/** Makes every following server call behave as if `user` is logged in. */
export function signInAs(user: SessionUser) {
  vi.mocked(getCurrentSession).mockResolvedValue({
    user: {
      id: user.id,
      username: user.username,
      name: user.name ?? user.username,
      email: null,
      role: user.role ?? "USER",
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
}

/** Makes every following server call behave as an anonymous visitor. */
export function signOut() {
  vi.mocked(getCurrentSession).mockResolvedValue(null);
}
