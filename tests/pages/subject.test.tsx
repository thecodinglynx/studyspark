import { describe, expect, it } from "vitest";
import SubjectPage from "@/app/subjects/[id]/page";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createAdmin,
  createChecklistSubject,
  createFlashcardSubject,
  createStudySession,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { shareSubjectWithGroup } from "@/lib/groups";
import { createGroup } from "../helpers/factories";
import { routeContext } from "../helpers/http";
import { redirectTarget, renderPage } from "../helpers/render";

const open = (id: string) => SubjectPage(routeContext({ id }));
const render = async (id: string) => renderPage(await open(id));

describe("subject page access", () => {
  it("sends anonymous visitors to the login page", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    expect(await redirectTarget(() => open(subject.id))).toBe("/login");
  });

  it("sends users without access back to the dashboard", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id, { title: "Secret" });

    signInAs(await createUser());

    expect(await redirectTarget(() => open(subject.id))).toBe("/dashboard");
  });

  it("shows not-found for an unknown subject", async () => {
    signInAs(await createUser());

    await expect(open("does-not-exist")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("flashcard subject page", () => {
  it("gives a regular owner the study view and the card manager, but no sharing section", async () => {
    const owner = await createUser({ username: "owner" });
    const { subject } = await createFlashcardSubject(owner.id, {
      title: "Chemistry",
      description: "Exam 3",
    });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Chemistry Owned by you");
    expect(text).toContain("Exam 3");
    expect(text).toContain("Card 1 of 3");
    expect(text).toContain("Card manager");
    expect(text).toContain("No sessions yet. Start your first study run!");
    expect(text).not.toContain("Sharing");
    expect(text).not.toContain("Invite teammates by username");
    expect(text).not.toContain("Share subject");
  });

  it("gives an editor the card manager but no sharing section", async () => {
    const owner = await createUser({ username: "owner" });
    const editor = await createUser({ username: "editor" });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, editor.id, "EDITOR");

    signInAs(editor);
    const { text } = await render(subject.id);

    expect(text).toContain("Owned by owner");
    expect(text).toContain("Card manager");
    expect(text).not.toContain("Sharing");
    expect(text).not.toContain("These collaborators have access to this subject.");
    expect(text).not.toContain("Share subject");
  });

  it("gives a viewer the study view only", async () => {
    const owner = await createUser({ username: "owner" });
    const viewer = await createUser({ username: "viewer" });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, viewer.id, "VIEWER");

    signInAs(viewer);
    const { text } = await render(subject.id);

    expect(text).toContain("Card 1 of 3");
    expect(text).not.toContain("Card manager");
    expect(text).not.toContain("Sharing");
    expect(text).not.toContain("These collaborators have access to this subject.");
    expect(text).not.toContain("Share subject");
  });

  it("does not send other users' names to a viewer in any form", async () => {
    const owner = await createUser({ username: "owner" });
    const viewer = await createUser({ username: "viewer" });
    const pal = await createUser({ username: "secretpal", name: "Secret Pal" });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, viewer.id, "VIEWER");
    await shareSubject(subject.id, pal.id, "EDITOR");

    signInAs(viewer);
    const { html } = await render(subject.id);

    expect(html).not.toContain("secretpal");
    expect(html).not.toContain("Secret Pal");
  });

  it("does not send other users' names to a regular owner either", async () => {
    const owner = await createUser({ username: "owner" });
    const pal = await createUser({ username: "secretpal", name: "Secret Pal" });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, pal.id, "EDITOR");

    signInAs(owner);
    const { html } = await render(subject.id);

    expect(html).not.toContain("secretpal");
    expect(html).not.toContain("Secret Pal");
  });

  it("shows an admin who owns the subject the sharing controls and collaborators", async () => {
    const admin = await createAdmin();
    const friend = await createUser({ username: "friend", name: "Best Friend" });
    const { subject } = await createFlashcardSubject(admin.id);
    await shareSubject(subject.id, friend.id, "EDITOR");

    signInAs(admin);
    const { text } = await render(subject.id);

    expect(text).toContain("Sharing");
    expect(text).toContain("Invite teammates by username");
    expect(text).toContain("Share subject");
    expect(text).toContain("friend Best Friend editor Remove");
  });

  it("shows an admin who was only given access the collaborators, read-only", async () => {
    const owner = await createUser({ username: "owner" });
    const admin = await createAdmin();
    const friend = await createUser({ username: "friend", name: "Best Friend" });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, admin.id, "VIEWER");
    await shareSubject(subject.id, friend.id, "EDITOR");

    signInAs(admin);
    const { text } = await render(subject.id);

    expect(text).toContain("Sharing");
    expect(text).toContain("These collaborators have access to this subject.");
    expect(text).toContain("friend Best Friend editor");
    expect(text).not.toContain("Share subject");
    expect(text).not.toContain("Remove");
  });

  it("does not open a subject for an admin who has no access to it", async () => {
    const owner = await createUser();
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(admin);

    expect(await redirectTarget(() => open(subject.id))).toBe("/dashboard");
  });

  it("lets the owner delete the subject", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id, { title: "Chemistry" });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Delete this subject");
    expect(text).toContain("Delete subject…");
  });

  it("lets the owner of a checklist delete it too", async () => {
    const owner = await createUser();
    const { subject } = await createChecklistSubject(owner.id);

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Delete this subject");
  });

  it.each(["EDITOR", "VIEWER"] as const)(
    "does not offer deletion to a %s",
    async (role) => {
      const owner = await createUser();
      const collaborator = await createUser();
      const { subject } = await createFlashcardSubject(owner.id);
      await shareSubject(subject.id, collaborator.id, role);

      signInAs(collaborator);
      const { text } = await render(subject.id);

      expect(text).not.toContain("Delete this subject");
    }
  );

  it("does not offer deletion to an admin who only has access to the subject", async () => {
    const owner = await createUser();
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, admin.id, "VIEWER");

    signInAs(admin);
    const { text } = await render(subject.id);

    expect(text).not.toContain("Delete this subject");
  });

  it("shows the user's own totals, accuracy and session history", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, viewer.id);
    await createStudySession(subject.id, owner.id, {
      correct: 3,
      incorrect: 1,
      durationMin: 6,
      cardCount: 3,
    });
    await createStudySession(subject.id, viewer.id, { correct: 0, incorrect: 8 });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("3 Cards 3 Correct 1 Incorrect 75% Accuracy");
    expect(text).toContain("3 of 3 cards 3 correct 1 incorrect Studied for 6 min");
    expect(text).not.toContain("8 incorrect");
  });

  it("lists collaborators for an admin", async () => {
    const owner = await createAdmin();
    const friend = await createUser({ username: "friend", name: "Best Friend" });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareSubject(subject.id, friend.id, "EDITOR");

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("friend Best Friend editor Remove");
  });

  it("handles a subject whose cards were all removed", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id, { cards: [] });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("No cards available");
    expect(text).toContain("0 Cards 0 Correct 0 Incorrect 0% Accuracy");
  });
});

describe("checklist subject page", () => {
  it("gives a regular owner the checklist and its manager, but no sharing section", async () => {
    const owner = await createUser();
    const { subject } = await createChecklistSubject(owner.id, { title: "Piano" });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Piano Owned by you");
    expect(text).toContain("Select the items you practiced today");
    expect(text).toContain("Warm-up scales");
    expect(text).toContain("Checklist manager");
    expect(text).not.toContain("Sharing");
    expect(text).not.toContain("Share subject");
    expect(text).toContain("2 Items 0 Total practices Not practiced yet Last practiced");
    expect(text).not.toContain("Card manager");
  });

  it("hides the checklist manager from a viewer", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { subject } = await createChecklistSubject(owner.id);
    await shareSubject(subject.id, viewer.id, "VIEWER");

    signInAs(viewer);
    const { text } = await render(subject.id);

    expect(text).toContain("Select the items you practiced today");
    expect(text).not.toContain("Checklist manager");
  });

  it("counts every practice the user logged, not just the recent ones shown", async () => {
    const owner = await createUser();
    const { subject, items } = await createChecklistSubject(owner.id);
    await prisma.checklistEntry.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        subjectId: subject.id,
        itemId: items[index % 2].id,
        userId: owner.id,
        practicedAt: new Date(Date.UTC(2025, 0, index + 1, 12)),
      })),
    });

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("2 Items 25 Total practices");
    expect(text).toContain(
      "Jan 25, 2025 Last practiced"
    );
  });

  it("shows each user their own practice history and last-practiced dates", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { subject, items } = await createChecklistSubject(owner.id);
    await shareSubject(subject.id, viewer.id);
    await prisma.checklistEntry.create({
      data: { subjectId: subject.id, itemId: items[0].id, userId: owner.id },
    });

    signInAs(viewer);
    const { text } = await render(subject.id);

    expect(text).toContain("0 Total practices");
    expect(text).toContain("Last practiced Never");
    expect(text).not.toMatch(/Last practiced \d/);
    expect(text).toContain("No practice logged yet.");
  });
});

describe("sharing a subject with a group", () => {
  const shareWith = (subjectId: string, ownerId: string, groupId: string, role: "VIEWER" | "EDITOR" = "VIEWER") =>
    prisma.$transaction((tx) => shareSubjectWithGroup(tx, { subjectId, ownerId, groupId, role }));

  it("offers the owner a way to share with their group", async () => {
    const group = await createGroup("Karate club");
    const owner = await createUser({ groupId: group.id });
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Share with your group");
    expect(text).toContain("Share with Karate club");
    expect(text).not.toContain("Stop sharing");
  });

  it("shows the current state once it is shared", async () => {
    const group = await createGroup("Karate club");
    const owner = await createUser({ groupId: group.id });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareWith(subject.id, owner.id, group.id, "EDITOR");

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Everyone in Karate club can open this subject as an editor");
    expect(text).toContain("Stop sharing");
  });

  it("works for checklists too", async () => {
    const group = await createGroup("Karate club");
    const owner = await createUser({ groupId: group.id });
    const { subject } = await createChecklistSubject(owner.id);

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Share with your group");
  });

  it("tells an owner who is not in a group why there is nobody to share with", async () => {
    const owner = await createUser();
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Share with a group");
    expect(text).toContain("You are not in a group, so there is nobody to share this with yet");
    expect(text).toContain("signing up with an invite code puts you in one");
    expect(text).not.toContain("Share with your group");
  });

  it("offers an ordinary member only their own group, not other groups", async () => {
    const group = await createGroup("Karate club");
    await createGroup("Judo club");
    const owner = await createUser({ groupId: group.id });
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text).toContain("Share with Karate club");
    expect(text).not.toContain("Judo club");
  });

  it("offers an admin every group to choose from, even one they are not in", async () => {
    await createGroup("Karate club");
    await createGroup("Judo club");
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const { text } = await render(subject.id);

    expect(text).toContain("Share with a group");
    expect(text).toContain("Choose which groups can open this subject");
    expect(text).toContain("Share with Karate club");
    expect(text).toContain("Share with Judo club");
  });

  it("lists an admin's own group first", async () => {
    await createGroup("Aikido");
    const mine = await createGroup("Zen club");
    const admin = await createUser({ username: "boss", role: "ADMIN", groupId: mine.id });
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const { text } = await render(subject.id);

    expect(text.indexOf("Share with Zen club")).toBeLessThan(text.indexOf("Share with Aikido"));
  });

  it("tells an admin when there are no groups to share with yet", async () => {
    const admin = await createAdmin();
    const { subject } = await createFlashcardSubject(admin.id);

    signInAs(admin);
    const { text, html } = await render(subject.id);

    expect(text).toContain("There are no groups yet");
    expect(html).toContain('href="/admin"');
  });

  it("shows the control near the top of the page, not below the card editor", async () => {
    const group = await createGroup("Karate club");
    const owner = await createUser({ groupId: group.id });
    const { subject } = await createFlashcardSubject(owner.id);

    signInAs(owner);
    const { text } = await render(subject.id);

    expect(text.indexOf("Share with your group")).toBeLessThan(text.indexOf("Card manager"));
  });

  it("is not offered to group members who are not the owner, even editors", async () => {
    const group = await createGroup("Karate club");
    const owner = await createUser({ groupId: group.id });
    const editor = await createUser({ groupId: group.id });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareWith(subject.id, owner.id, group.id, "EDITOR");

    signInAs(editor);
    const { text } = await render(subject.id);

    expect(text).not.toContain("Share with your group");
    expect(text).not.toContain("Delete this subject");
    // They can open and edit it, as shared.
    expect(text).toContain("Card manager");
  });

  it("opens for a member of the group the subject is shared with", async () => {
    const group = await createGroup("Karate club");
    const owner = await createUser({ username: "owner", groupId: group.id });
    const member = await createUser({ groupId: group.id });
    const { subject } = await createFlashcardSubject(owner.id, { title: "Katas" });
    await shareWith(subject.id, owner.id, group.id);

    signInAs(member);
    const { text } = await render(subject.id);

    expect(text).toContain("Katas");
    expect(text).toContain("Card 1 of 3");
  });

  it("marks group-sourced shares for an admin and offers no Remove for them", async () => {
    const group = await createGroup("Karate club");
    const admin = await createAdmin();
    const owner = await createUser({ username: "owner", groupId: group.id });
    const member = await createUser({ username: "member", groupId: group.id });
    const { subject } = await createFlashcardSubject(owner.id);
    await shareWith(subject.id, owner.id, group.id);
    await shareSubject(subject.id, admin.id, "VIEWER");
    expect(member.id).toBeTruthy();

    signInAs(admin);
    const { text } = await render(subject.id);

    expect(text).toContain("member");
    expect(text).toContain("via group");
    expect(text).not.toContain("Remove");
  });
});
