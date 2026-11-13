import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import {
  auth,
  hardNavigate,
  navigation,
  resetBrowserFakes,
  router,
} from "../helpers/browser";

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

vi.mock("@/lib/navigate", () => ({
  hardNavigate: (path: string) => hardNavigate(path),
}));

// A plain anchor: the real component needs the App Router around it. The
// prefetch setting is kept as a data attribute so tests can check it.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) =>
    createElement(
      "a",
      { href, "data-prefetch": String(prefetch ?? "default"), ...rest },
      children
    ),
}));

beforeEach(() => {
  resetBrowserFakes();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
