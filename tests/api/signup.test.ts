import { compare } from "bcryptjs";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/signup/route";
import { prisma } from "@/lib/prisma";
import { createUser } from "../helpers/factories";
import { json, request } from "../helpers/http";

const signup = (body: unknown) => POST(request("POST", "/api/signup", body));

describe("POST /api/signup", () => {
  it("creates an account and returns only public fields", async () => {
    const response = await signup({
      username: "jane_doe",
      password: "secret123",
      name: "Jane Doe",
    });

    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body).toEqual({
      id: expect.any(String),
      username: "jane_doe",
      name: "Jane Doe",
    });
    expect(body).not.toHaveProperty("passwordHash");
  });

  it("stores a bcrypt hash, never the plain password", async () => {
    await signup({ username: "jane_doe", password: "secret123" });

    const user = await prisma.user.findUniqueOrThrow({
      where: { username: "jane_doe" },
    });
    expect(user.passwordHash).not.toContain("secret123");
    expect(await compare("secret123", user.passwordHash)).toBe(true);
  });

  it("allows signing up without a name", async () => {
    const response = await signup({ username: "noname", password: "secret123" });

    expect(response.status).toBe(201);
    expect((await json(response)).name).toBeNull();
  });

  it("rejects a username that is already taken", async () => {
    await createUser({ username: "taken" });

    const response = await signup({ username: "taken", password: "secret123" });

    expect(response.status).toBe(409);
    expect((await json(response)).error).toBe("Username already taken");
    expect(await prisma.user.count()).toBe(1);
  });

  it.each([
    ["username shorter than 3 characters", { username: "ab", password: "secret123" }],
    ["username longer than 32 characters", { username: "a".repeat(33), password: "secret123" }],
    ["username with spaces", { username: "jane doe", password: "secret123" }],
    ["username with punctuation", { username: "jane-doe!", password: "secret123" }],
    ["password shorter than 6 characters", { username: "jane", password: "12345" }],
    ["password longer than 128 characters", { username: "jane", password: "x".repeat(129) }],
    ["name shorter than 2 characters", { username: "jane", password: "secret123", name: "J" }],
    ["missing password", { username: "jane" }],
    ["missing username", { password: "secret123" }],
  ])("rejects %s", async (_label, body) => {
    const response = await signup(body);

    expect(response.status).toBe(400);
    expect((await json(response)).error).toBe("Invalid data");
    expect(await prisma.user.count()).toBe(0);
  });
});
