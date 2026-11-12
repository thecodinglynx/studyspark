import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/dashboard/page";
import { prisma } from "@/lib/prisma";
import { signInAs } from "../helpers/auth";
import {
  createChecklistSubject,
  createFlashcardSubject,
  createStudySession,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { redirectTarget, renderPage } from "../helpers/render";

const render = async () => renderPage(await DashboardPage());

describe("dashboard page", () => {
  it("sends anonymous visitors to the login page", async () => {
    expect(await redirectTarget(() => DashboardPage())).toBe("/login");
  });

  it("greets a new user and shows the empty state", async () => {
    signInAs(await createUser({ username: "jane" }));

    const { text, html } = await render();

    expect(text).toContain("Welcome back, jane");
    expect(text).toContain("No subjects yet. Create one to start studying!");
    expect(text).toContain("0 Sessions 0 Correct 0 Incorrect");
    expect(html).toContain('href="/subjects/new"');
  });

  it("lists owned and shared subjects with a link to each, but not other people's", async () => {
    const me = await createUser({ username: "me" });
    const friend = await createUser({ username: "friend" });
    const stranger = await createUser({ username: "stranger" });
    const { subject: mine } = await createFlashcardSubject(me.id, {
      title: "My chemistry",
      description: "Exam 3",
    });
    const { subject: shared } = await createFlashcardSubject(friend.id, {
      title: "Friend's history",
    });
    await shareSubject(shared.id, me.id);
    await createFlashcardSubject(stranger.id, { title: "Secret subject" });

    signInAs(me);
    const { text, html } = await render();

    expect(text).toContain("My chemistry Owned by you");
    expect(text).toContain("Exam 3");
    expect(text).toContain("Friend's history Shared by friend");
    expect(text).not.toContain("Secret subject");
    expect(text).not.toContain("No subjects yet");
    expect(html).toContain(`href="/subjects/${mine.id}"`);
    expect(html).toContain(`href="/subjects/${shared.id}"`);
  });

  it("summarises flashcard progress from the user's own sessions", async () => {
    const me = await createUser();
    const friend = await createUser();
    const { subject } = await createFlashcardSubject(me.id);
    await shareSubject(subject.id, friend.id);
    await createStudySession(subject.id, me.id, { correct: 2, incorrect: 1, cardCount: 3 });
    await createStudySession(subject.id, me.id, { correct: 1, incorrect: 0, cardCount: 1 });
    await createStudySession(subject.id, friend.id, { correct: 0, incorrect: 9, cardCount: 9 });

    signInAs(me);
    const { text } = await render();

    expect(text).toContain("3 cards 75% accuracy 4 attempts");
    expect(text).toContain("2 Sessions 3 Correct 1 Incorrect");
  });

  it("shows zero accuracy for a subject that was never studied", async () => {
    const me = await createUser();
    await createFlashcardSubject(me.id);

    signInAs(me);
    const { text } = await render();

    expect(text).toContain("3 cards 0% accuracy 0 attempts");
    expect(text).not.toContain("Recent sessions");
  });

  it("lists at most the five most recent sessions of a subject", async () => {
    const me = await createUser();
    const { subject } = await createFlashcardSubject(me.id);
    for (let day = 1; day <= 6; day += 1) {
      await createStudySession(subject.id, me.id, {
        correct: day,
        incorrect: 0,
        durationMin: 10 + day,
        cardCount: 3,
        studiedAt: new Date(2025, 2, day, 12),
      });
    }

    signInAs(me);
    const { text } = await render();

    expect(text).toContain("Recent sessions");
    expect(text).toContain("3/3 cards +6 -0 16 min");
    expect(text).toContain("+2 -0 12 min");
    expect(text).not.toContain("+1 -0 11 min");
  });

  it("summarises checklist practice", async () => {
    const me = await createUser();
    const { subject, items } = await createChecklistSubject(me.id, { title: "Piano" });
    const practicedAt = new Date(2025, 2, 5, 12);
    await prisma.checklistEntry.createMany({
      data: [
        { subjectId: subject.id, itemId: items[0].id, userId: me.id, practicedAt },
        {
          subjectId: subject.id,
          itemId: items[1].id,
          userId: me.id,
          practicedAt: new Date(2025, 2, 1, 12),
        },
      ],
    });

    signInAs(me);
    const { text } = await render();

    expect(text).toContain(
      `2 checklist items 2 practices Last practiced ${practicedAt.toLocaleDateString()}`
    );
    expect(text).toContain("Recent practice Warm-up scales");
  });

  it("says when a checklist was never practiced", async () => {
    const me = await createUser();
    await createChecklistSubject(me.id);

    signInAs(me);
    const { text } = await render();

    expect(text).toContain("2 checklist items 0 practices Not practiced yet");
  });

  it("does not count a collaborator's checklist practice as the user's", async () => {
    const me = await createUser();
    const friend = await createUser();
    const { subject, items } = await createChecklistSubject(me.id);
    await shareSubject(subject.id, friend.id);
    await prisma.checklistEntry.create({
      data: { subjectId: subject.id, itemId: items[0].id, userId: friend.id },
    });

    signInAs(me);
    const { text } = await render();

    expect(text).toContain("0 practices Not practiced yet");
  });
});
