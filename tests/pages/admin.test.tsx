import { describe, expect, it } from "vitest";
import AdminPage from "@/app/admin/page";
import { config as proxyConfig } from "@/proxy";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createAdmin,
  createChecklistSubject,
  createFlashcardSubject,
  createGroup,
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

describe("admin page groups", () => {
  it("lists groups with their members, and people who have no group", async () => {
    const admin = await createAdmin();
    const group = await createGroup("Karate club");
    await createUser({ username: "alice", name: "Alice A", groupId: group.id });
    await createUser({ username: "loner", name: null });

    signInAs(admin);
    const { text } = renderPage(await AdminPage());

    expect(text).toContain("Groups");
    expect(text).toContain("Karate club");
    expect(text).toContain("1 member · 0 invite codes · 0 shared subjects");
    expect(text).toContain("Alice A (@alice)");
    // The admin and the other user have no group.
    expect(text).toContain("People without a group (2)");
    expect(text).toContain("loner");
  });

  it("shows which group each code's signups join", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);
    const group = await createGroup("Karate club");
    const code = await createInviteCode(admin.id, [subject.id], { code: "JOINUS23" });
    await prisma.inviteCode.update({ where: { id: code.id }, data: { groupId: group.id } });
    await createInviteCode(admin.id, [subject.id], { code: "NOGROUP2" });

    signInAs(admin);
    const { text } = renderPage(await AdminPage());

    expect(text).toContain("Signups join the group “Karate club”");
    expect(text).toContain("Signups are not put in a group");
  });

  it("offers the groups when creating a code", async () => {
    const admin = await createAdmin();
    await createGroup("Karate club");

    signInAs(admin);
    const { html } = renderPage(await AdminPage());

    expect(html).toContain("New group named after the code");
    expect(html).toContain("No group");
  });

  it("says so when there are no groups yet", async () => {
    signInAs(await createAdmin());

    const { text } = renderPage(await AdminPage());

    expect(text).toContain("No groups yet.");
  });
});
