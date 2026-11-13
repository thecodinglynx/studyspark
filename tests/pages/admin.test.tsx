import { describe, expect, it } from "vitest";
import AdminPage from "@/app/admin/page";
import { config as proxyConfig } from "@/proxy";
import { signInAs } from "../helpers/auth";
import {
  createAdmin,
  createChecklistSubject,
  createFlashcardSubject,
  createInviteCode,
  createUser,
} from "../helpers/factories";
import { redirectTarget, renderPage } from "../helpers/render";

describe("admin page", () => {
  it("sends anonymous visitors to the login page", async () => {
    expect(await redirectTarget(() => AdminPage())).toBe("/login");
  });

  it("sends regular users to the dashboard", async () => {
    signInAs(await createUser());

    expect(await redirectTarget(() => AdminPage())).toBe("/dashboard");
  });

  it("is covered by the route guard", () => {
    expect(proxyConfig.matcher).toContain("/admin/:path*");
  });

  it("lists every subject from every user, with its owner", async () => {
    const admin = await createAdmin();
    const alice = await createUser({ username: "alice" });
    const bob = await createUser({ username: "bob" });
    await createFlashcardSubject(alice.id, { title: "Alice chemistry" });
    await createChecklistSubject(bob.id, { title: "Bob piano" });
    await createFlashcardSubject(admin.id, { title: "Admin history" });

    signInAs(admin);
    const { text } = renderPage(await AdminPage());

    expect(text).toContain("Alice chemistry 3 cards · by alice");
    expect(text).toContain("Bob piano 2 checklist items · by bob");
    expect(text).toContain("Admin history 3 cards · by admin");
    expect(text).toContain("0 of 3 subjects selected");
  });

  it("lists existing codes with their subjects and usage", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id, { title: "Chemistry" });
    await createInviteCode(admin.id, [subject.id], {
      code: "JOINUS23",
      role: "EDITOR",
      maxUses: 5,
      usedCount: 2,
    });

    signInAs(admin);
    const { text } = renderPage(await AdminPage());

    expect(text).toContain("JOINUS23");
    expect(text).toContain("Editor access to Chemistry");
    expect(text).toContain("Used 2 of 5 times");
  });

  it("says when there are no codes yet", async () => {
    signInAs(await createAdmin());

    const { text } = renderPage(await AdminPage());

    expect(text).toContain("No invite codes yet.");
  });
});
