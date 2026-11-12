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

type PieData = { labels: string[]; datasets: Array<{ data: number[] }> };
type BarData = {
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
};

const render = async (userId: string) => renderPage(await AnalyticsView({ userId }));

const monthsAgo = (months: number) => {
  const date = new Date();
  date.setDate(15);
  date.setMonth(date.getMonth() - months);
  return date;
};

describe("analytics page", () => {
  it("sends anonymous visitors to the login page", async () => {
    expect(await redirectTarget(() => AnalyticsPage())).toBe("/login");
  });

  it("shows empty states before anything has been studied", async () => {
    const me = await createUser();
    await createFlashcardSubject(me.id);

    const page = await render(me.id);

    expect(page.text).toContain("No practice data yet.");
    expect(page.text).toContain("No recent practice yet.");
    expect(page.text).not.toContain("Most missed flashcards");
    expect(page.chart("pie")).toBeNull();
    expect(page.chart("bar")).toBeNull();
  });

  it("charts the practice mix: sessions per flashcard subject, entries per checklist", async () => {
    const me = await createUser();
    const { subject: cards } = await createFlashcardSubject(me.id, { title: "Chemistry" });
    const { subject: list, items } = await createChecklistSubject(me.id, { title: "Piano" });
    await createStudySession(cards.id, me.id);
    await createStudySession(cards.id, me.id);
    await prisma.checklistEntry.createMany({
      data: [0, 1, 0].map((index) => ({
        subjectId: list.id,
        itemId: items[index].id,
        userId: me.id,
      })),
    });

    const pie = (await render(me.id)).chart<PieData>("pie")!;

    const byLabel = Object.fromEntries(
      pie.labels.map((label, index) => [label, pie.datasets[0].data[index]])
    );
    expect(byLabel).toEqual({ Chemistry: 2, Piano: 3 });
  });

  it("charts twelve months of activity ending with the current month", async () => {
    const me = await createUser();
    const { subject } = await createFlashcardSubject(me.id, { title: "Chemistry" });
    await createStudySession(subject.id, me.id, { studiedAt: new Date() });
    await createStudySession(subject.id, me.id, { studiedAt: new Date() });
    await createStudySession(subject.id, me.id, { studiedAt: monthsAgo(3) });

    const bar = (await render(me.id)).chart<BarData>("bar")!;

    expect(bar.labels).toHaveLength(12);
    expect(bar.labels[11]).toContain(String(new Date().getFullYear()));
    const chemistry = bar.datasets.find((d) => d.label === "Chemistry")!;
    expect(chemistry.data[11]).toBe(2);
    expect(chemistry.data[8]).toBe(1);
    expect(chemistry.data.reduce((sum, value) => sum + value, 0)).toBe(3);
  });

  it("ignores activity older than twelve months", async () => {
    const me = await createUser();
    const { subject } = await createFlashcardSubject(me.id);
    await createStudySession(subject.id, me.id, { studiedAt: monthsAgo(13) });

    const page = await render(me.id);

    expect(page.text).toContain("No practice data yet.");
    expect(page.text).toContain("No recent practice yet.");
  });

  it("only counts the user's own activity on shared subjects", async () => {
    const me = await createUser();
    const friend = await createUser();
    const { subject } = await createFlashcardSubject(friend.id, { title: "Shared deck" });
    await shareSubject(subject.id, me.id);
    await createStudySession(subject.id, friend.id);
    await createStudySession(subject.id, friend.id);
    await createStudySession(subject.id, me.id);

    const pie = (await render(me.id)).chart<PieData>("pie")!;

    expect(pie.labels).toEqual(["Shared deck"]);
    expect(pie.datasets[0].data).toEqual([1]);
  });

  it("leaves out subjects the user has no access to", async () => {
    const me = await createUser();
    const stranger = await createUser();
    const { subject } = await createFlashcardSubject(stranger.id, { title: "Secret" });
    await createStudySession(subject.id, stranger.id);

    const page = await render(me.id);

    expect(page.html).not.toContain("Secret");
  });

  it("ranks the most missed flashcards, worst first, skipping cards never missed", async () => {
    const me = await createUser();
    const friend = await createUser();
    const { subject, cards } = await createFlashcardSubject(me.id, { title: "Chemistry" });
    await shareSubject(subject.id, friend.id);
    await prisma.cardPerformance.createMany({
      data: [
        { cardId: cards[0].id, subjectId: subject.id, userId: me.id, incorrectCount: 2, correctCount: 5 },
        { cardId: cards[1].id, subjectId: subject.id, userId: me.id, incorrectCount: 7 },
        { cardId: cards[2].id, subjectId: subject.id, userId: me.id, correctCount: 4 },
        // Someone else's misses must not show up in my list.
        { cardId: cards[2].id, subjectId: subject.id, userId: friend.id, incorrectCount: 99 },
      ],
    });

    const { text } = await render(me.id);

    expect(text).toContain("Most missed flashcards");
    expect(text).toContain("Missed 7 Capital of France → Paris");
    expect(text).toContain("Missed 2 Correct 5 2 + 2 → 4");
    expect(text.indexOf("Missed 7")).toBeLessThan(text.indexOf("Missed 2"));
    expect(text).not.toContain("H2O");
    expect(text).not.toContain("Missed 99");
  });

  it("limits the most-missed list to twenty cards per subject", async () => {
    const me = await createUser();
    const { subject, cards } = await createFlashcardSubject(me.id, {
      cards: Array.from({ length: 22 }, (_, index) => ({
        prompt: `Prompt-${index + 1}.`,
        answer: "x",
      })),
    });
    await prisma.cardPerformance.createMany({
      data: cards.map((card, index) => ({
        cardId: card.id,
        subjectId: subject.id,
        userId: me.id,
        incorrectCount: index + 1,
      })),
    });

    const { text } = await render(me.id);

    expect(text.match(/Missed \d+/g)).toHaveLength(20);
    expect(text).toContain("Prompt-22.");
    expect(text).toContain("Prompt-3.");
    expect(text).not.toContain("Prompt-2.");
    expect(text).not.toContain("Prompt-1.");
  });

  it("highlights the most and least practiced checklist items", async () => {
    const me = await createUser();
    const { subject, items } = await createChecklistSubject(me.id, {
      title: "Piano",
      items: [{ title: "Scales" }, { title: "Arpeggios" }, { title: "Repertoire" }],
    });
    await prisma.checklistEntry.createMany({
      data: [0, 0, 0, 1].map((index) => ({
        subjectId: subject.id,
        itemId: items[index].id,
        userId: me.id,
      })),
    });

    const { text } = await render(me.id);

    expect(text).toContain("Checklist highlights");
    expect(text).toContain("Most frequent Scales (3 completions)");
    expect(text).toContain("Least frequent Repertoire (0 completions)");
  });
});
