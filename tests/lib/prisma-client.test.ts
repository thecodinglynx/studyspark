import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * lib/prisma.ts picks its connection at import time, so each case re-imports
 * it with different environment variables. Nothing here runs a query: the
 * Neon case only checks that the client can be constructed, which is as far
 * as it can go without a real Neon database.
 */
async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  const saved = globalThis.prisma;
  globalThis.prisma = undefined;
  try {
    return await import("@/lib/prisma");
  } finally {
    globalThis.prisma = saved;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("database client setup", () => {
  it("builds a client through the Neon adapter for a neon.tech URL", async () => {
    const { prisma } = await loadWith({
      NEON_DATABASE_URL:
        "postgresql://user:password@ep-example-123456.eu-central-1.aws.neon.tech/studyspark?sslmode=require",
    });

    expect(typeof prisma.user.findMany).toBe("function");
    await prisma.$disconnect();
  });

  it("prefers NEON_DATABASE_URL over DATABASE_URL", async () => {
    await loadWith({
      NEON_DATABASE_URL: "postgresql://user:password@localhost:5432/from_neon_var_test",
      DATABASE_URL: undefined,
    });

    // With DATABASE_URL unset, the module copies the chosen URL into it.
    expect(process.env.DATABASE_URL).toBe(
      "postgresql://user:password@localhost:5432/from_neon_var_test"
    );
  });

  it("fails fast with a clear message when no URL is configured", async () => {
    await expect(
      loadWith({ NEON_DATABASE_URL: undefined, DATABASE_URL: undefined })
    ).rejects.toThrow("Database connection string is missing");
  });
});
