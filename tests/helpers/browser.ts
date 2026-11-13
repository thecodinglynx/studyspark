import { vi, type Mock } from "vitest";

type AnyFunction = (...args: unknown[]) => unknown;

/**
 * Shared fakes for the things client components reach outside themselves for:
 * the Next.js router, the next-auth session and fetch. tests/setup/ui.ts wires
 * the first two into `next/navigation` and `next-auth/react`.
 */

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
};

export const navigation = { pathname: "/" };

/** Stands in for lib/navigate, which would reload the page in a real browser. */
export const hardNavigate = vi.fn<(path: string) => void>();

type SessionState =
  | { status: "loading"; data: null }
  | { status: "unauthenticated"; data: null }
  | {
      status: "authenticated";
      data: { user: { id: string; username: string; role?: "USER" | "ADMIN" } };
    };

export const auth: {
  session: SessionState;
  signIn: Mock<AnyFunction>;
  signOut: Mock<AnyFunction>;
} = {
  session: { status: "unauthenticated", data: null },
  signIn: vi.fn<AnyFunction>(),
  signOut: vi.fn<AnyFunction>(),
};

export function resetBrowserFakes() {
  Object.values(router).forEach((fn) => fn.mockReset());
  navigation.pathname = "/";
  hardNavigate.mockReset();
  auth.session = { status: "unauthenticated", data: null };
  auth.signIn.mockReset();
  auth.signOut.mockReset();
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Replaces global fetch. Each call is answered by the next queued response;
 * once the queue is empty every call gets `200 {}`.
 */
export function mockFetch(...responses: Response[]) {
  const queue = [...responses];
  const fetchMock = vi.fn<typeof fetch>(
    async () => queue.shift() ?? jsonResponse({})
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The method, URL and parsed JSON body of the nth fetch call. */
export function fetchCall(fetchMock: ReturnType<typeof mockFetch>, index = 0) {
  const call = fetchMock.mock.calls[index];
  if (!call) {
    throw new Error(`fetch was called ${fetchMock.mock.calls.length} time(s)`);
  }
  const [url, init] = call;
  return {
    url: String(url),
    method: init?.method ?? "GET",
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  };
}
