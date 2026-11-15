import { describe, expect, it } from "vitest";
import SettingsPage from "@/app/settings/page";
import { signInAs } from "../helpers/auth";
import { createGroup, createUser } from "../helpers/factories";
import { redirectTarget, renderPage } from "../helpers/render";

describe("settings page", () => {
  it("sends anonymous visitors to the login page", async () => {
    expect(await redirectTarget(() => SettingsPage())).toBe("/login");
  });

  it("shows the current name, the username and the group", async () => {
    const group = await createGroup("Karate club");
    const me = await createUser({ username: "jane", name: "Jane Learner", groupId: group.id });
    signInAs(me);

    const { html, text } = await renderPage(await SettingsPage());

    expect(html).toContain('value="Jane Learner"');
    expect(html).toContain('value="jane"');
    expect(text).toContain("Karate club");
  });
});
