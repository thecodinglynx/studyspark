import { describe, expect, it } from "vitest";
import { GET, PATCH } from "@/app/api/profile/route";
import { prisma } from "@/lib/prisma";
import { signInAs, signOut } from "../helpers/auth";
import { createGroup, createUser } from "../helpers/factories";
import { json, rawRequest, request } from "../helpers/http";

const patch = (body: unknown) => PATCH(request("PATCH", "/api/profile", body));

describe("/api/profile", () => {
  it("requires a login", async () => {
    signOut();
    expect((await GET()).status).toBe(401);
    expect((await patch({ name: "x" })).status).toBe(401);
  });

  it("returns the name, username and group", async () => {
    const group = await createGroup("Karate club");
    const me = await createUser({ username: "jane", name: "Jane", groupId: group.id });
    signInAs(me);

    expect(await json(await GET())).toEqual({
      username: "jane",
      name: "Jane",
      groupName: "Karate club",
    });
  });

  it("changes the name, trimmed, and never the login", async () => {
    const me = await createUser({ username: "jane", name: "Jane" });
    signInAs(me);

    const response = await patch({ name: "  Jane Learner  ", username: "hacker" });

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ username: "jane", name: "Jane Learner" });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.name).toBe("Jane Learner");
    expect(stored.username).toBe("jane");
  });

  it("clears the name when it is empty or blank", async () => {
    const me = await createUser({ username: "jane", name: "Jane" });
    signInAs(me);

    expect(await json(await patch({ name: "   " }))).toMatchObject({ name: null });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).name).toBeNull();
  });

  it("only changes the signed-in user", async () => {
    const me = await createUser({ username: "jane" });
    const other = await createUser({ username: "bob", name: "Bob" });
    signInAs(me);

    await patch({ name: "Jane" });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).name).toBe("Bob");
  });

  it("rejects names that are too long, missing or the wrong type", async () => {
    signInAs(await createUser());

    expect((await patch({ name: "x".repeat(65) })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ name: 5 })).status).toBe(400);
    expect((await PATCH(rawRequest("PATCH", "/api/profile", "{nope"))).status).toBe(400);
  });
});
