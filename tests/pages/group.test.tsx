import { describe, expect, it } from "vitest";
import GroupPage from "@/app/group/page";
import { shareSubjectWithGroup } from "@/lib/groups";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createChecklistSubject,
  createFlashcardSubject,
  createGroup,
  createUser,
} from "../helpers/factories";
import { redirectTarget, renderPage } from "../helpers/render";

const render = async () => renderPage(await GroupPage());

const shareWith = (
  subjectId: string,
  ownerId: string,
  groupId: string,
  role: "VIEWER" | "EDITOR" = "VIEWER"
) => prisma.$transaction((tx) => shareSubjectWithGroup(tx, { subjectId, ownerId, groupId, role }));

describe("group page", () => {
  it("sends anonymous visitors to the login page", async () => {
    expect(await redirectTarget(() => GroupPage())).toBe("/login");
  });

  it("explains how groups work to someone who is not in one", async () => {
    signInAs(await createUser());

    const { text } = await render();

    expect(text).toContain("You are not in a group");
    expect(text).toContain("Groups are set up by an admin");
    expect(text).toContain("invite code");
    expect(text).toContain("Back to your subjects");
  });

  it("shows the group's name and who is in it, marking the viewer", async () => {
    const group = await createGroup("Karate club");
    const me = await createUser({ username: "me", name: "Me Myself", groupId: group.id });
    await createUser({ username: "alice", name: "Alice A", groupId: group.id });
    await createUser({ username: "bob", name: null, groupId: group.id });

    signInAs(me);
    const { text } = await render();

    expect(text).toContain("Karate club");
    expect(text).toContain("Members (3)");
    expect(text).toContain("Alice A @alice");
    expect(text).toContain("Me Myself @me You");
    // Someone with no display name shows as their username, not twice.
    expect(text).toMatch(/\bbob\b(?! @bob)/);
    expect(text).not.toContain("@bob");
  });

  it("does not show people from other groups or people with no group", async () => {
    const group = await createGroup("Karate club");
    const other = await createGroup("Judo club");
    const me = await createUser({ username: "me", groupId: group.id });
    await createUser({ username: "judoka", groupId: other.id });
    await createUser({ username: "outsider" });

    signInAs(me);
    const { html } = await render();

    expect(html).not.toContain("judoka");
    expect(html).not.toContain("outsider");
    expect(html).not.toContain("Judo club");
  });

  it("never exposes email addresses or password hashes", async () => {
    const group = await createGroup("Karate club");
    const me = await createUser({ groupId: group.id });
    await createUser({ groupId: group.id });
    await prisma.user.update({ where: { id: me.id }, data: { email: "private@example.com" } });

    signInAs(me);
    const { html } = await render();

    expect(html).not.toContain("private@example.com");
    expect(html).not.toContain("passwordHash");
  });

  it("links to the comparison on the analytics page", async () => {
    const group = await createGroup("Karate club");
    signInAs(await createUser({ groupId: group.id }));

    const { html, text } = await render();

    expect(text).toContain("See how you compare");
    expect(html).toContain('href="/analytics"');
  });

  describe("shared subjects", () => {
    it("lists what members have shared, who by, and what members can do", async () => {
      const group = await createGroup("Karate club");
      const me = await createUser({ username: "me", groupId: group.id });
      const alice = await createUser({ username: "alice", name: "Alice A", groupId: group.id });
      const { subject: katas } = await createFlashcardSubject(alice.id, { title: "Katas" });
      const { subject: stances } = await createChecklistSubject(alice.id, {
        title: "Stances",
        items: [{ title: "a" }, { title: "b" }],
      });
      await shareWith(katas.id, alice.id, group.id, "VIEWER");
      await shareWith(stances.id, alice.id, group.id, "EDITOR");

      signInAs(me);
      const { text, html } = await render();

      expect(text).toContain("Katas Flashcards 3 cards · Shared by Alice A · Members can study");
      expect(text).toContain("Stances Checklist 2 items · Shared by Alice A · Members can edit");
      expect(html).toContain(`href="/subjects/${katas.id}"`);
    });

    it("says 'Shared by you' for the viewer's own subjects", async () => {
      const group = await createGroup("Karate club");
      const me = await createUser({ username: "me", groupId: group.id });
      const { subject } = await createFlashcardSubject(me.id, { title: "My deck" });
      await shareWith(subject.id, me.id, group.id);

      signInAs(me);
      const { text } = await render();

      expect(text).toContain("My deck Flashcards 3 cards · Shared by you");
    });

    it("leaves out subjects that are not shared, or shared with another group", async () => {
      const group = await createGroup("Karate club");
      const other = await createGroup("Judo club");
      const me = await createUser({ username: "me", groupId: group.id });
      const alice = await createUser({ username: "alice", groupId: group.id });
      const judoka = await createUser({ username: "judoka", groupId: other.id });
      await createFlashcardSubject(alice.id, { title: "Private deck" });
      const { subject: judo } = await createFlashcardSubject(judoka.id, { title: "Judo deck" });
      await shareWith(judo.id, judoka.id, other.id);

      signInAs(me);
      const { text } = await render();

      expect(text).not.toContain("Private deck");
      expect(text).not.toContain("Judo deck");
      expect(text).toContain("Nothing has been shared yet.");
    });

    it("explains how to share one's own", async () => {
      const group = await createGroup("Karate club");
      signInAs(await createUser({ groupId: group.id }));

      const { text } = await render();

      expect(text).toContain("Share with your group");
    });
  });
});
