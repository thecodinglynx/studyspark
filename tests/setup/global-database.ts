import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

/**
 * Runs once before the server tests: creates the test database if needed and
 * brings it up to date with the migrations in prisma/migrations.
 *
 * The URL comes from vitest.config.mts, which has already checked that it is
 * a local database whose name ends in "_test".
 */
export default function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL;
  if (!url) {
    throw new Error("vitest.config.mts did not provide a test DATABASE_URL.");
  }

  try {
    execSync("npx prisma migrate deploy", {
      cwd: project.config.root,
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    });
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr: unknown }).stderr)
        : String(error);
    throw new Error(
      "Could not prepare the test database. Is PostgreSQL running?\n" + detail
    );
  }
}
