import { describe, expect, it } from "vitest";
import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";
import LandingPage from "@/app/page";
import NewSubjectPage from "@/app/subjects/new/page";
import { config as proxyConfig } from "@/proxy";
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
  it("guards the dashboard and all subject pages before they render", () => {
    expect(proxyConfig.matcher).toEqual(
      expect.arrayContaining(["/dashboard/:path*", "/subjects/:path*"])
    );
  });
});
