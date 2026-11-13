import { describe, expect, it } from "vitest";
import { AnalyticsView, loadGroup } from "@/components/analytics/analytics-view";
import { shareSubjectWithGroup } from "@/lib/groups";
import { prisma } from "@/lib/prisma";
import {
  createChecklistSubject,
  createFlashcardSubject,
  createGroup,
  createStudySession,
  createUser,
} from "../helpers/factories";
import { renderPage } from "../helpers/render";

const render = async (userId: string) => renderPage(await AnalyticsView({ userId }));

/** Midday UTC, n days ago. The server builds this page in UTC. */
function daysAgo(days: number): Date {
  const base = new Date();
  base.setUTCHours(12, 0, 0, 0);
  return new Date(base.getTime() - days * 86_400_000);
}

const shareWith = (subjectId: string, ownerId: string, groupId: string) =>
  prisma.$transaction((tx) =>
    shareSubjectWithGroup(tx, { subjectId, ownerId, groupId, role: "VIEWER" })
  );

async function setup() {
  const group = await createGroup("Karate club");
  const me = await createUser({ username: "me", name: "Me Myself", groupId: group.id });
  const alice = await createUser({ username: "alice", name: "Alice A", groupId: group.id });
  const bob = await createUser({ username: "bob", name: null, groupId: group.id });
  return { group, me, alice, bob };
}

describe("analytics for someone in a group", () => {
  it("shows nothing about a group to someone who is not in one", async () => {
    const loner = await createUser();
    const { subject } = await createFlashcardSubject(loner.id);
    await createStudySession(subject.id, loner.id, { studiedAt: daysAgo(0) });

    const { text } = await render(loner.id);

    expect(text).not.toContain("Your group");
    expect(text).not.toContain("How you compare");
  });

  it("shows the group's name and an overview", async () => {
    const { me, alice } = await setup();
    const { subject } = await createFlashcardSubject(me.id);
    await createStudySession(subject.id, me.id, { correct: 8, incorrect: 2, durationMin: 20, studiedAt: daysAgo(0) });
    await createStudySession(subject.id, alice.id, { correct: 6, incorrect: 4, durationMin: 10, studiedAt: daysAgo(1) });

    const { text } = await render(me.id);

    expect(text).toContain("Your group: Karate club");
    expect(text).toContain("Active this week 2 of 3 members studied in the last 7 days");
    expect(text).toContain("Group study time 30 min 2 flashcard sessions in the last 30 days");
    expect(text).toContain("Group accuracy 70% You: 80% · last 30 days");
    expect(text).toContain("Your days studied 1 Group average: 0.7 · last 30 days");
  });

  it("compares the viewer with each member, most active first", async () => {
    const { me, alice, bob } = await setup();
    const { subject } = await createFlashcardSubject(me.id);
    await createStudySession(subject.id, alice.id, { studiedAt: daysAgo(0) });
    await createStudySession(subject.id, alice.id, { studiedAt: daysAgo(1) });
    await createStudySession(subject.id, me.id, { studiedAt: daysAgo(0) });
    expect(bob.id).toBeTruthy();

    const { text } = await render(me.id);

    expect(text).toContain("How you compare");
    expect(text.indexOf("Alice A")).toBeLessThan(text.indexOf("Me Myself You"));
    expect(text).toContain("Me Myself You");
    // Someone with no display name appears as their username.
    expect(text).toMatch(/\bbob\b/);
  });

  it("says the group is quiet when nobody has studied recently", async () => {
    const { me } = await setup();

    const { text } = await render(me.id);

    expect(text).toContain("Nobody in the group has studied in the last 30 days yet.");
    expect(text).not.toContain("How you compare");
  });

  it("says so when the viewer is the only member", async () => {
    const group = await createGroup("Solo");
    const me = await createUser({ groupId: group.id });

    const { text } = await render(me.id);

    expect(text).toContain("You are the only member of this group so far.");
  });

  it("compares members on subjects shared with the group", async () => {
    const { group, me, alice } = await setup();
    const { subject } = await createFlashcardSubject(alice.id, { title: "Katas" });
    await shareWith(subject.id, alice.id, group.id);
    await createStudySession(subject.id, alice.id, { correct: 9, incorrect: 1, studiedAt: daysAgo(0) });
    await createStudySession(subject.id, me.id, { correct: 5, incorrect: 5, studiedAt: daysAgo(1) });

    const { text } = await render(me.id);

    expect(text).toContain("Shared subjects");
    expect(text).toContain("Katas");
    expect(text).toContain("Alice A 1 90%");
    expect(text).toContain("Me Myself You 1 50%");
  });

  it("compares checklist practice on a shared checklist", async () => {
    const { group, me, alice } = await setup();
    const { subject, items } = await createChecklistSubject(alice.id, { title: "Stances" });
    await shareWith(subject.id, alice.id, group.id);
    await prisma.checklistEntry.createMany({
      data: [
        { subjectId: subject.id, itemId: items[0].id, userId: alice.id, practicedAt: daysAgo(0) },
        { subjectId: subject.id, itemId: items[1].id, userId: alice.id, practicedAt: daysAgo(1) },
      ],
    });

    const { text } = await render(me.id);

    expect(text).toContain("Stances");
    expect(text).toContain("Alice A 2");
  });
});

describe("loadGroup", () => {
  it("returns nothing for someone without a group", async () => {
    expect(await loadGroup((await createUser()).id, new Date())).toBeUndefined();
  });

  it("returns only the viewer's own group, marking who is the viewer", async () => {
    const { group, me, alice } = await setup();
    const other = await createGroup("Judo club");
    const judoka = await createUser({ username: "judoka", groupId: other.id });
    const { subject } = await createFlashcardSubject(judoka.id);
    await createStudySession(subject.id, judoka.id, { studiedAt: daysAgo(0) });
    expect(group.id).toBeTruthy();

    const result = await loadGroup(me.id, new Date());

    expect(result?.name).toBe("Karate club");
    expect(result?.members.map((m) => [m.username, m.isYou])).toEqual([
      ["alice", false],
      ["bob", false],
      ["me", true],
    ]);
    expect(result?.sessions).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("judoka");
    expect(alice.id).toBeTruthy();
  });

  it("keeps the identity of subjects shared with the group but hides the rest", async () => {
    const { group, me, alice } = await setup();
    const { subject: shared } = await createFlashcardSubject(alice.id, { title: "Shared deck" });
    const { subject: secret } = await createFlashcardSubject(alice.id, { title: "Secret deck" });
    await shareWith(shared.id, alice.id, group.id);
    await createStudySession(shared.id, alice.id, { studiedAt: daysAgo(1) });
    await createStudySession(secret.id, alice.id, { studiedAt: daysAgo(2) });

    const result = await loadGroup(me.id, new Date());

    expect(result?.sessions.map((s) => s.subjectId).sort()).toEqual(["other", shared.id].sort());
    expect(result?.sharedSubjects.map((s) => s.title)).toEqual(["Shared deck"]);
    // The private subject's id and title never reach the browser.
    const payload = JSON.stringify(result);
    expect(payload).not.toContain(secret.id);
    expect(payload).not.toContain("Secret deck");
  });

  it("still counts study on a private subject towards a member's totals", async () => {
    const { me, alice } = await setup();
    const { subject } = await createFlashcardSubject(alice.id);
    await createStudySession(subject.id, alice.id, { correct: 3, incorrect: 1, durationMin: 12, studiedAt: daysAgo(1) });

    const result = await loadGroup(me.id, new Date());

    expect(result?.sessions).toEqual([
      expect.objectContaining({ userId: alice.id, correct: 3, incorrect: 1, durationMin: 12, subjectId: "other" }),
    ]);
  });

  it("only looks back 120 days", async () => {
    const { me, alice } = await setup();
    const { subject } = await createFlashcardSubject(alice.id);
    await createStudySession(subject.id, alice.id, { studiedAt: daysAgo(119) });
    await createStudySession(subject.id, alice.id, { studiedAt: daysAgo(125) });

    const result = await loadGroup(me.id, new Date());

    expect(result?.sessions).toHaveLength(1);
  });

  it("never includes email addresses, password hashes or other personal fields", async () => {
    const { me } = await setup();
    // Emails are unique, so give just one member an address.
    await prisma.user.update({ where: { id: me.id }, data: { email: "private@example.com" } });

    const payload = JSON.stringify(await loadGroup(me.id, new Date()));

    expect(payload).not.toContain("private@example.com");
    expect(payload).not.toContain("passwordHash");
    expect(payload).not.toContain("email");
  });
});
