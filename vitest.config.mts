import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Works out which database the server tests may use.
 *
 * `TEST_DATABASE_URL` wins if set. Otherwise the database name in
 * `DATABASE_URL` gets a `_test` suffix, so the tests use a sibling of the
 * development database on the same server.
 *
 * The tests wipe every table between cases, so this refuses anything that is
 * not obviously a throwaway database on this machine.
 */
function resolveTestDatabaseUrl(): string {
  const fileEnv = loadEnv("test", root, "");
  const explicit = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;

  let url: URL;
  if (explicit) {
    url = new URL(explicit);
  } else if (base) {
    url = new URL(base);
    const name = url.pathname.replace(/^\//, "");
    url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
    // Pooler flags from a hosted URL make no sense for the local test DB.
    url.search = "";
  } else {
    throw new Error(
      "Tests need a database. Set DATABASE_URL (or TEST_DATABASE_URL) in .env."
    );
  }

  const name = url.pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against database "${name}": its name must end in "_test".`
    );
  }

  const localHosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
  if (
    !localHosts.includes(url.hostname) &&
    !process.env.ALLOW_REMOTE_TEST_DATABASE
  ) {
    throw new Error(
      `Refusing to run tests against host "${url.hostname}". Tests wipe the database; ` +
        "use a local one, or set ALLOW_REMOTE_TEST_DATABASE=1 if this is a disposable CI database."
    );
  }

  return url.toString();
}

const testDatabaseUrl = resolveTestDatabaseUrl();

const shared = {
  plugins: [react()],
  resolve: {
    alias: { "@": root },
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        // API routes, server-rendered pages and server libraries. These run
        // against a real PostgreSQL test database, one file at a time.
        ...shared,
        test: {
          name: "server",
          environment: "node",
          include: ["tests/{api,lib,pages}/**/*.test.{ts,tsx}"],
          globalSetup: ["./tests/setup/global-database.ts"],
          setupFiles: ["./tests/setup/server.ts"],
          fileParallelism: false,
          env: {
            DATABASE_URL: testDatabaseUrl,
            DIRECT_URL: testDatabaseUrl,
            // lib/prisma.ts prefers NEON_DATABASE_URL, so it must point at
            // the test database too.
            NEON_DATABASE_URL: testDatabaseUrl,
            NEON_DIRECT_URL: testDatabaseUrl,
            NEXTAUTH_SECRET: "test-secret",
            NEXTAUTH_URL: "http://localhost:3000",
          },
        },
      },
      {
        // Client components, rendered in a simulated browser with fetch,
        // the router and next-auth mocked.
        ...shared,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/components/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup/ui.ts"],
        },
      },
    ],
  },
});
