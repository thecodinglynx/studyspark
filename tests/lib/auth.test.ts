import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGroup, createUser, TEST_PASSWORD } from "../helpers/factories";

type Authorize = (
  credentials: Record<string, string> | undefined
) => Promise<{
  id: string;
  username: string;
  name?: string | null;
  role?: "USER" | "ADMIN";
} | null>;

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
      role: "USER",
    });
  });

  it("reports the admin role for admin accounts", async () => {
    await createUser({ username: "boss", role: "ADMIN" });

    const result = await authorize({ username: "boss", password: TEST_PASSWORD });

    expect(result?.role).toBe("ADMIN");
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

  it("copies the role into the token and the session", async () => {
    const token = await callbacks.jwt!({
      token: {},
      user: { id: "user-1", username: "boss", role: "ADMIN" },
    } as never);
    const session = (await callbacks.session!({
      session: { user: { name: "Boss" }, expires: "2099-01-01" },
      token,
    } as never)) as Session;

    expect(session.user.role).toBe("ADMIN");
  });

  it("leaves the user's details alone on later requests", async () => {
    const token = await callbacks.jwt!({
      token: { id: "user-1", username: "jane", profileCheckedAt: Date.now() },
    } as never);

    expect(token).toMatchObject({ id: "user-1", username: "jane" });
  });

  describe("role and group in the token", () => {
    it("looks up the group name at sign-in", async () => {
      const group = await createGroup("Karate club");
      const user = await createUser({ username: "grouped", groupId: group.id });

      const token = await callbacks.jwt!({
        token: {},
        user: { id: user.id, username: "grouped", role: "USER" },
      } as never);

      expect(token.groupName).toBe("Karate club");
      expect(token.profileCheckedAt).toEqual(expect.any(Number));
    });

    it("has no group name for someone without a group", async () => {
      const user = await createUser({ username: "loner" });

      const token = await callbacks.jwt!({
        token: {},
        user: { id: user.id, username: "loner", role: "USER" },
      } as never);

      expect(token.groupName).toBeNull();
    });

    it("does not look again within a minute", async () => {
      const group = await createGroup("Karate club");
      const user = await createUser({ username: "grouped", groupId: group.id });
      const first = await callbacks.jwt!({
        token: {},
        user: { id: user.id, username: "grouped", role: "USER" },
      } as never);

      await prisma.user.update({ where: { id: user.id }, data: { groupId: null } });
      const second = await callbacks.jwt!({ token: first } as never);

      expect(second.groupName).toBe("Karate club");
    });

    it("notices a move into or out of a group, and a role change, once the check is stale", async () => {
      const user = await createUser({ username: "mover" });
      const group = await createGroup("Karate club");
      const first = await callbacks.jwt!({
        token: {},
        user: { id: user.id, username: "mover", role: "USER" },
      } as never);
      expect(first.groupName).toBeNull();

      await prisma.user.update({ where: { id: user.id }, data: { groupId: group.id, role: "ADMIN" } });
      const stale = { ...first, profileCheckedAt: Date.now() - 61_000 };
      const second = await callbacks.jwt!({ token: stale } as never);

      expect(second).toMatchObject({ groupName: "Karate club", role: "ADMIN" });
    });

    it("copes with a user that no longer exists", async () => {
      const token = await callbacks.jwt!({
        token: { id: "deleted-user", username: "gone", role: "USER" },
      } as never);

      expect(token.id).toBe("deleted-user");
      expect(token.profileCheckedAt).toEqual(expect.any(Number));
    });

    it("puts the group name on the session", async () => {
      const session = (await callbacks.session!({
        session: { user: { name: "Jane" }, expires: "2099-01-01" },
        token: { id: "user-1", username: "jane", groupName: "Karate club" },
      } as never)) as Session;

      expect(session.user.groupName).toBe("Karate club");
    });

    it("puts null on the session when there is no group", async () => {
      const session = (await callbacks.session!({
        session: { user: { name: "Jane" }, expires: "2099-01-01" },
        token: { id: "user-1", username: "jane" },
      } as never)) as Session;

      expect(session.user.groupName).toBeNull();
    });
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
