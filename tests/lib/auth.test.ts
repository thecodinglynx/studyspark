import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";
import { authOptions } from "@/lib/auth";
import { createUser, TEST_PASSWORD } from "../helpers/factories";

type Authorize = (
  credentials: Record<string, string> | undefined
) => Promise<{ id: string; username: string; name?: string | null } | null>;

// The credentials provider keeps the function we wrote under `options`.
const provider = authOptions.providers[0] as unknown as {
  options: { authorize: Authorize };
};
const authorize = provider.options.authorize;

describe("credentials login", () => {
  it("accepts the right username and password", async () => {
    const user = await createUser({ username: "jane", name: "Jane Doe" });

    const result = await authorize({ username: "jane", password: TEST_PASSWORD });

    expect(result).toEqual({
      id: user.id,
      name: "Jane Doe",
      email: null,
      username: "jane",
    });
  });

  it("falls back to the username when the account has no name", async () => {
    await createUser({ username: "noname", name: null });

    const result = await authorize({ username: "noname", password: TEST_PASSWORD });

    expect(result?.name).toBe("noname");
  });

  it("rejects a wrong password", async () => {
    await createUser({ username: "jane" });

    expect(await authorize({ username: "jane", password: "wrong-password" })).toBeNull();
  });

  it("rejects an unknown username", async () => {
    expect(await authorize({ username: "ghost", password: TEST_PASSWORD })).toBeNull();
  });

  it("treats usernames as case-sensitive", async () => {
    await createUser({ username: "jane" });

    expect(await authorize({ username: "JANE", password: TEST_PASSWORD })).toBeNull();
  });

  it.each([
    ["missing credentials", undefined],
    ["a too-short username", { username: "ab", password: TEST_PASSWORD }],
    ["a too-short password", { username: "jane", password: "123" }],
    ["a missing password", { username: "jane" }],
  ])("rejects %s without touching the database", async (_label, credentials) => {
    expect(await authorize(credentials as Record<string, string> | undefined)).toBeNull();
  });
});

describe("session callbacks", () => {
  const callbacks = authOptions.callbacks!;

  it("copies the user id and username into the token at login", async () => {
    const token = await callbacks.jwt!({
      token: {},
      user: { id: "user-1", username: "jane", name: "Jane" },
    } as never);

    expect(token).toMatchObject({ id: "user-1", username: "jane" });
  });

  it("leaves the token alone on later requests", async () => {
    const token = await callbacks.jwt!({
      token: { id: "user-1", username: "jane" },
    } as never);

    expect(token).toEqual({ id: "user-1", username: "jane" });
  });

  it("exposes the id and username on the session", async () => {
    const session = (await callbacks.session!({
      session: { user: { name: "Jane" }, expires: "2099-01-01" },
      token: { id: "user-1", username: "jane" },
    } as never)) as Session;

    expect(session.user).toMatchObject({ id: "user-1", username: "jane" });
  });
});

describe("auth configuration", () => {
  it("uses JWT sessions and the custom login page", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
    expect(authOptions.pages?.signIn).toBe("/login");
  });
});
