import { createElement, type ReactNode } from "react";
import { afterAll, beforeEach, vi } from "vitest";

// Database access is real. What is faked is the framework around it: the
// session (tests pick the user with signInAs()/signOut() from
// tests/helpers/auth), cache revalidation, navigation and charts.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getCurrentSession: vi.fn(async () => null) };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// redirect()/notFound() normally throw framework-internal errors. Here they
// throw plain errors that tests can assert on.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: unknown }) => children,
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

// Charts draw on a canvas, which says nothing in a test. Record the data they
// were given instead; renderPage().chart() reads it back.
vi.mock("react-chartjs-2", () => {
  const chart = (kind: string) =>
    function ChartStub({ data }: { data: unknown }) {
      return createElement("div", {
        "data-chart": kind,
        "data-json": JSON.stringify(data),
      });
    };
  return { Pie: chart("pie"), Bar: chart("bar") };
});

// vitest.config.mts already vetted the URL; this is a last line of defence
// before the TRUNCATE below.
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) {
  throw new Error("Server tests must run against a database ending in _test.");
}

const { prisma } = await import("@/lib/prisma");
const { signOut } = await import("../helpers/auth");

beforeEach(async () => {
  signOut();

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length > 0) {
    const list = tables.map((table) => `"${table.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
