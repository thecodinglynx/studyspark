import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionCookieName, shouldUseSecureCookies } from "@/lib/auth-cookies";

describe("shouldUseSecureCookies", () => {
  it.each([
    ["https://studyspark-silk.vercel.app", true],
    ["HTTPS://studyspark-silk.vercel.app", true],
    // next-auth treats an address without a scheme as https.
    ["studyspark-silk.vercel.app", true],
    ["  studyspark-silk.vercel.app  ", true],
    ["http://localhost:3000", false],
    ["http://192.168.1.42:3000", false],
  ])("for NEXTAUTH_URL=%j returns %s", (url, expected) => {
    expect(shouldUseSecureCookies({ NEXTAUTH_URL: url })).toBe(expected);
  });

  it("follows Vercel when NEXTAUTH_URL is not set", () => {
    expect(shouldUseSecureCookies({ VERCEL: "1" })).toBe(true);
    expect(shouldUseSecureCookies({})).toBe(false);
  });

  it("lets NEXTAUTH_URL win over Vercel", () => {
    expect(shouldUseSecureCookies({ VERCEL: "1", NEXTAUTH_URL: "http://localhost:3000" })).toBe(
      false
    );
  });

  it("treats a blank NEXTAUTH_URL as not set", () => {
    expect(shouldUseSecureCookies({ NEXTAUTH_URL: "   ", VERCEL: "1" })).toBe(true);
  });
});

describe("sessionCookieName", () => {
  it("uses the __Secure- prefix only on https", () => {
    expect(sessionCookieName(true)).toBe("__Secure-next-auth.session-token");
    expect(sessionCookieName(false)).toBe("next-auth.session-token");
  });
});

/**
 * The regression behind the /login <-> /dashboard loop: the proxy and the
 * pages must agree on the cookie name whatever NEXTAUTH_URL looks like.
 */
describe("proxy and login agree on the session cookie", () => {
  it("expects the secure cookie name for an address without https://, as before", async () => {
    vi.stubEnv("NEXTAUTH_URL", "studyspark-silk.vercel.app");
    vi.resetModules();

    const { authOptions } = await vi.importActual<typeof import("@/lib/auth")>(
      "@/lib/auth"
    );

    // Sessions created before this fix used this name, so they keep working.
    expect(authOptions.useSecureCookies).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // undefined removes the variable, which is different from an empty one.
  const settings: Array<[string, Record<string, string | undefined>]> = [
    ["a full https address", { NEXTAUTH_URL: "https://studyspark-silk.vercel.app" }],
    ["an address without https://", { NEXTAUTH_URL: "studyspark-silk.vercel.app" }],
    ["no address, on Vercel", { NEXTAUTH_URL: undefined, VERCEL: "1" }],
    ["a local http address", { NEXTAUTH_URL: "http://localhost:3000", VERCEL: undefined }],
  ];

  it.each(settings)("accepts a valid login with %s", async (_label, env) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.resetModules();

    // The real auth module (the shared test setup replaces @/lib/auth with a
    // mock that would keep the settings of the first import).
    const { authOptions } = await vi.importActual<typeof import("@/lib/auth")>(
      "@/lib/auth"
    );
    const { proxy } = await import("@/proxy");

    // The cookie the login would set, named the way next-auth names it.
    const cookieName = sessionCookieName(authOptions.useSecureCookies === true);
    const token = await encode({ token: { id: "user-1" }, secret: "test-secret" });

    const response = await (proxy as unknown as (
      req: NextRequest,
      event: unknown
    ) => Promise<Response | undefined>)(
      new NextRequest("http://localhost:3000/dashboard", {
        headers: { cookie: `${cookieName}=${token}` },
      }),
      {}
    );

    expect(response).toBeUndefined();
  });
});
