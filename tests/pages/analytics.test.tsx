import { describe, expect, it } from "vitest";
import AnalyticsPage from "@/app/analytics/page";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { prisma } from "@/lib/prisma";
import {
  createChecklistSubject,
  createFlashcardSubject,
  createStudySession,
  createUser,
  shareSubject,
} from "../helpers/factories";
import { redirectTarget, renderPage } from "../helpers/render";

type ChartData = {
  labels: string[];
  datasets: Array<{ label: string; data: Array<number | null> }>;
};

const render = async (userId: string) => renderPage(await AnalyticsView({ userId }));

/** Midday UTC, n days ago. The server builds this page in UTC. */
function daysAgo(days: number): Date {
  const base = new Date();
  base.setUTCHours(12, 0, 0, 0);
  return new Date(base.getTime() - days * 86_400_000);
}

async function recordCard(
  cardId: string,
  subjectId: string,
  userId: string,
  correctCount: number,
  incorrectCount: number
) {
  await prisma.cardPerformance.create({
    data: { cardId, subjectId, userId, correctCount, incorrectCount },
  });
}

describe("analytics page", () => {
  it("sends anonymous visitors to the login page", async () => {
    expect(await redirectTarget(() => AnalyticsPage())).toBe("/login");
  });

  it("invites a user with no subjects to get started", async () => {
    const me = await createUser();

    const { text } = await render(me.id);

    expect(text).toContain("Nothing to show yet");
    expect(text).toContain("You have no subjects yet.");
  });

  it("still lists subjects that have not been studied, flagged as not started", async () => {
    const me = await createUser();
    await createFlashcardSubject(me.id, { title: "Chemistry" });

    const { text } = await render(me.id);

    expect(text).toContain("Nothing to show yet");
    expect(text).toContain("Chemistry Flashcards Last practiced: Not started yet");
    // No charts until there is something to chart.
    expect(text).not.toContain("Accuracy over time");
  });

  describe("overview", () => {
    it("shows the streak, days studied, time studied and accuracy", async () => {
      const me = await createUser();
      const { subject } = await createFlashcardSubject(me.id);
      await createStudySession(subject.id, me.id, {
        correct: 8, incorrect: 2, durationMin: 20, studiedAt: daysAgo(0),
      });
      await createStudySession(subject.id, me.id, {
        correct: 6, incorrect: 4, durationMin: 25, studiedAt: daysAgo(1),
      });
      await createStudySession(subject.id, me.id, {
        correct: 7, incorrect: 3, durationMin: 20, studiedAt: daysAgo(2),
      });

      const { text } = await render(me.id);

      expect(text).toContain("Current streak 3 days Longest so far: 3 days");
      expect(text).toContain("Days studied 3 in the last 30 days");
      expect(text).toContain("Study time 1 h 5 min 3 flashcard sessions in the last 30 days");
      expect(text).toContain("Accuracy 70% of answers right, last 30 days");
    });

    it("compares accuracy with the previous 30 days", async () => {
      const me = await createUser();
      const { subject } = await createFlashcardSubject(me.id);
      await createStudySession(subject.id, me.id, { correct: 8, incorrect: 2, studiedAt: daysAgo(1) });
      await createStudySession(subject.id, me.id, { correct: 5, incorrect: 5, studiedAt: daysAgo(40) });

      const { text } = await render(me.id);

      expect(text).toContain("▲ 30 points up on the 30 days before");
    });

    it("does not count anyone else's study", async () => {
      const me = await createUser();
      const friend = await createUser();
      const { subject } = await createFlashcardSubject(me.id);
      await shareSubject(subject.id, friend.id);
      await createStudySession(subject.id, friend.id, { correct: 9, incorrect: 1, studiedAt: daysAgo(0) });

      const { text } = await render(me.id);

      expect(text).toContain("Nothing to show yet");
    });

    it("counts checklist practice towards the streak", async () => {
      const me = await createUser();
      const { subject, items } = await createChecklistSubject(me.id);
      await prisma.checklistEntry.createMany({
        data: [
          { subjectId: subject.id, itemId: items[0].id, userId: me.id, practicedAt: daysAgo(0) },
          { subjectId: subject.id, itemId: items[1].id, userId: me.id, practicedAt: daysAgo(1) },
        ],
      });

      const { text } = await render(me.id);

      expect(text).toContain("Current streak 2 days");
    });
  });

  describe("where to focus next", () => {
    it("puts the least recently practiced subject first and flags neglect", async () => {
      const me = await createUser();
      const { subject: recent } = await createFlashcardSubject(me.id, { title: "Recent" });
      const { subject: old } = await createFlashcardSubject(me.id, { title: "Old" });
      await createStudySession(recent.id, me.id, { studiedAt: daysAgo(0) });
      await createStudySession(old.id, me.id, { studiedAt: daysAgo(20) });

      const { text } = await render(me.id);

      expect(text.indexOf("Old")).toBeLessThan(text.indexOf("Recent Flashcards"));
      expect(text).toContain("Old Flashcards Last practiced: 20 days ago Not practiced in 20 days");
      expect(text).toContain("Recent Flashcards Last practiced: Today");
      expect(text).not.toContain("Not practiced in 0 days");
    });

    it("shows how many cards are mastered, still being learned, and untouched", async () => {
      const me = await createUser();
      const { subject, cards } = await createFlashcardSubject(me.id, {
        cards: [
          { prompt: "a", answer: "1" },
          { prompt: "b", answer: "2" },
          { prompt: "c", answer: "3" },
          { prompt: "d", answer: "4" },
        ],
      });
      await createStudySession(subject.id, me.id, { studiedAt: daysAgo(0) });
      await recordCard(cards[0].id, subject.id, me.id, 5, 0); // mastered
      await recordCard(cards[1].id, subject.id, me.id, 1, 2); // learning

      const { text } = await render(me.id);

      expect(text).toContain("1 mastered 1 still learning 2 not started");
    });

    it("shows checklist coverage over the last 14 days", async () => {
      const me = await createUser();
      const { subject, items } = await createChecklistSubject(me.id, { title: "Piano" });
      await prisma.checklistEntry.createMany({
        data: [
          { subjectId: subject.id, itemId: items[0].id, userId: me.id, practicedAt: daysAgo(3) },
          { subjectId: subject.id, itemId: items[1].id, userId: me.id, practicedAt: daysAgo(30) },
        ],
      });

      const { text } = await render(me.id);

      expect(text).toContain("1 of 2 items practiced in the last 14 days.");
    });

    it("leaves out subjects the user has no access to", async () => {
      const me = await createUser();
      const stranger = await createUser();
      const { subject } = await createFlashcardSubject(stranger.id, { title: "Secret" });
      await createStudySession(subject.id, stranger.id, { studiedAt: daysAgo(0) });

      const { html } = await render(me.id);

      expect(html).not.toContain("Secret");
    });
  });

  describe("charts", () => {
    it("charts weekly accuracy for each flashcard subject that has answers", async () => {
      const me = await createUser();
      const { subject: chem } = await createFlashcardSubject(me.id, { title: "Chemistry" });
      await createFlashcardSubject(me.id, { title: "Unstudied" });
      await createChecklistSubject(me.id, { title: "Piano" });
      await createStudySession(chem.id, me.id, { correct: 3, incorrect: 1, studiedAt: daysAgo(0) });

      const line = (await render(me.id)).chart<ChartData>("line")!;

      expect(line.labels).toHaveLength(12);
      expect(line.datasets.map((d) => d.label)).toEqual(["Chemistry"]);
      const lastWeek = line.datasets[0].data[11];
      expect(lastWeek).toBe(75);
      // Weeks without study are gaps, not zeros.
      expect(line.datasets[0].data.slice(0, 11).every((v) => v === null)).toBe(true);
    });

    it("charts days studied per week across the last twelve weeks", async () => {
      const me = await createUser();
      const { subject } = await createFlashcardSubject(me.id);
      await createStudySession(subject.id, me.id, { studiedAt: daysAgo(0) });
      await createStudySession(subject.id, me.id, { studiedAt: daysAgo(0) }); // same day

      const bar = (await render(me.id)).chart<ChartData>("bar")!;

      expect(bar.labels).toHaveLength(12);
      expect(bar.datasets).toHaveLength(1);
      expect(bar.datasets[0].label).toBe("Days studied");
      expect(bar.datasets[0].data.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(1);
    });
  });

  describe("cards to review", () => {
    it("lists cards still missed as often as they are right, and not ones that improved", async () => {
      const me = await createUser();
      const friend = await createUser();
      const { subject, cards } = await createFlashcardSubject(me.id, {
        cards: [
          { prompt: "Hard card", answer: "Hard answer" },
          { prompt: "Improved card", answer: "Easy answer" },
          { prompt: "Friend's trouble", answer: "x" },
        ],
      });
      await shareSubject(subject.id, friend.id);
      await createStudySession(subject.id, me.id, { studiedAt: daysAgo(0) });
      await recordCard(cards[0].id, subject.id, me.id, 1, 4);
      await recordCard(cards[1].id, subject.id, me.id, 20, 5);
      await recordCard(cards[2].id, subject.id, friend.id, 0, 9);

      const { text } = await render(me.id);

      expect(text).toContain("Cards to review");
      expect(text).toContain("Hard card Hard answer Right 1 of 5 (20%)");
      expect(text).not.toContain("Improved card");
      expect(text).not.toContain("Friend's trouble");
    });

    it("is not shown when nothing needs review", async () => {
      const me = await createUser();
      const { subject, cards } = await createFlashcardSubject(me.id);
      await createStudySession(subject.id, me.id, { studiedAt: daysAgo(0) });
      await recordCard(cards[0].id, subject.id, me.id, 9, 1);

      const { text } = await render(me.id);

      expect(text).not.toContain("Cards to review");
    });
  });

  describe("checklist items to practice next", () => {
    it("lists never-practiced items first, then the longest ago", async () => {
      const me = await createUser();
      const { subject, items } = await createChecklistSubject(me.id, {
        title: "Piano",
        items: [{ title: "Scales" }, { title: "Arpeggios" }, { title: "Repertoire" }],
      });
      await prisma.checklistEntry.createMany({
        data: [
          { subjectId: subject.id, itemId: items[0].id, userId: me.id, practicedAt: daysAgo(1) },
          { subjectId: subject.id, itemId: items[1].id, userId: me.id, practicedAt: daysAgo(9) },
        ],
      });

      const { text } = await render(me.id);

      expect(text).toContain("Checklist items to practice next");
      expect(text).toContain(
        "Repertoire Never practiced Arpeggios 9 days ago Scales Yesterday"
      );
    });

    it("does not pretend a single item is both the most and the least practiced", async () => {
      const me = await createUser();
      await createChecklistSubject(me.id, { title: "Solo", items: [{ title: "Only item" }] });

      const { text } = await render(me.id);

      expect(text).not.toContain("Most frequent");
      expect(text).not.toContain("Least frequent");
      expect(text).toContain("Only item Never practiced");
    });
  });
});
