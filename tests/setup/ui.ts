import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { auth, navigation, resetBrowserFakes, router } from "../helpers/browser";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => auth.session,
  signIn: (...args: unknown[]) => auth.signIn(...args),
  signOut: (...args: unknown[]) => auth.signOut(...args),
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

// A plain anchor: the real component needs the App Router around it.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => createElement("a", { href, ...rest }, children),
}));

beforeEach(() => {
  resetBrowserFakes();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
