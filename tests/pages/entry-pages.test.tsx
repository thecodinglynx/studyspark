import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { describe, expect, it } from "vitest";
import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";
import LandingPage from "@/app/page";
import NewSubjectPage from "@/app/subjects/new/page";
import { config as proxyConfig, proxy } from "@/proxy";
import { signInAs } from "../helpers/auth";
import { createUser } from "../helpers/factories";
import { redirectTarget, renderPage } from "../helpers/render";

describe("pages for anonymous visitors", () => {
  it("shows the landing page with links to sign up and log in", async () => {
    const { text, html } = renderPage(await LandingPage());

    expect(text).toContain("Get started free");
    expect(html).toContain('href="/signup"');
    expect(html).toContain('href="/login"');
  });

  it("shows the login form", async () => {
    const { text, html } = renderPage(await LoginPage());

    expect(text).toContain("Welcome back");
    expect(text).toContain("Log in");
    expect(html).toContain('name="username"');
    expect(html).toContain('type="password"');
    expect(html).toContain('href="/signup"');
  });

  it("shows the signup form", async () => {
    const { text, html } = renderPage(await SignupPage());

    expect(text).toContain("Create your StudySpark account");
    expect(html).toContain('name="username"');
    expect(html).toContain('href="/login"');
  });

  it("sends them to login instead of the new-subject page", async () => {
    expect(await redirectTarget(() => NewSubjectPage())).toBe("/login");
  });
});

describe("pages for signed-in users", () => {
  it.each([
    ["landing page", LandingPage],
    ["login page", LoginPage],
    ["signup page", SignupPage],
  ])("skips the %s and goes to the dashboard", async (_name, Page) => {
    signInAs(await createUser());

    expect(await redirectTarget(() => Page())).toBe("/dashboard");
  });

  it("shows the new-subject form", async () => {
    signInAs(await createUser());

    const { text } = renderPage(await NewSubjectPage());

    expect(text).toContain("New subject");
    expect(text).toContain("Save subject");
  });
});

describe("route protection", () => {
  const runProxy = (path: string, cookie?: string) =>
    proxy(
      new NextRequest(`http://localhost:3000${path}`, {
        headers: cookie ? { cookie } : undefined,
      }) as never,
      {} as never
    ) as Promise<Response | undefined>;

  it("sends an anonymous visitor straight to /login, keeping a relative callback", async () => {
    const response = await runProxy("/dashboard");

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2Fdashboard"
    );
  });

  it("protects subject and admin pages the same way", async () => {
    for (const path of ["/subjects/abc", "/subjects/new", "/admin"]) {
      const response = await runProxy(path);
      expect(response?.headers.get("location")).toBe(
        `http://localhost:3000/login?callbackUrl=${encodeURIComponent(path)}`
      );
    }
  });

  it("lets a logged-in visitor through", async () => {
    const token = await encode({ token: { id: "user-1" }, secret: "test-secret" });

    const response = await runProxy("/dashboard", `next-auth.session-token=${token}`);

    expect(response).toBeUndefined();
  });

  it("treats a token signed with a different secret as logged out", async () => {
    const token = await encode({ token: { id: "user-1" }, secret: "some-other-secret" });

    const response = await runProxy("/dashboard", `next-auth.session-token=${token}`);

    expect(response?.status).toBe(307);
  });

  it("never intercepts the login page itself", async () => {
    expect(await runProxy("/login")).toBeUndefined();
  });

  it("guards the dashboard and all subject pages before they render", () => {
    expect(proxyConfig.matcher).toEqual(
      expect.arrayContaining(["/dashboard/:path*", "/subjects/:path*"])
    );
  });
});
