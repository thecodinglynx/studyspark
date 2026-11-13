import { prisma } from "@/lib/prisma";
import { TopNav } from "@/components/top-nav";
import {
  AnalyticsDashboard,
  type AnalyticsData,
} from "@/components/analytics/analytics-dashboard";

interface AnalyticsViewProps {
  userId: string;
}

/** How far back the group comparison looks. */
const GROUP_HISTORY_DAYS = 120;

/** How far back the page looks. Longer than the charts, so streaks are honest. */
const HISTORY_DAYS = 365;

/**
 * Gathers the user's study history. The working-out happens in the browser
 * (see AnalyticsDashboard), because "today", "this week" and streaks depend on
 * the viewer's timezone, which the server does not know.
 */
export async function AnalyticsView({ userId }: AnalyticsViewProps) {
  const now = new Date();
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);

  const subjects = await prisma.subject.findMany({
    where: { OR: [{ ownerId: userId }, { shares: { some: { userId } } }] },
    select: {
      id: true,
      title: true,
      type: true,
      _count: { select: { cards: true } },
      checklistItems: {
        orderBy: { position: "asc" },
        select: { id: true, title: true },
      },
    },
    orderBy: { title: "asc" },
  });
  const subjectIds = subjects.map((subject) => subject.id);

  const [sessions, practices, cardPerformances] = await Promise.all([
    prisma.studySession.findMany({
      where: { userId, subjectId: { in: subjectIds }, studiedAt: { gte: since } },
      orderBy: { studiedAt: "asc" },
      select: {
        subjectId: true,
        studiedAt: true,
        correct: true,
        incorrect: true,
        durationMin: true,
      },
    }),
    prisma.checklistEntry.findMany({
      where: { userId, subjectId: { in: subjectIds }, practicedAt: { gte: since } },
      orderBy: { practicedAt: "asc" },
      select: { subjectId: true, itemId: true, practicedAt: true },
    }),
    prisma.cardPerformance.findMany({
      where: { userId, subjectId: { in: subjectIds } },
      select: {
        cardId: true,
        subjectId: true,
        correctCount: true,
        incorrectCount: true,
        card: { select: { prompt: true, answer: true } },
      },
    }),
  ]);

  const group = await loadGroup(userId, now);

  const data: AnalyticsData = {
    group,
    now: now.toISOString(),
    subjects: subjects.map((subject) => ({
      id: subject.id,
      title: subject.title,
      type: subject.type,
      cardCount: subject._count.cards,
      items: subject.checklistItems,
    })),
    sessions: sessions.map((session) => ({
      subjectId: session.subjectId,
      at: session.studiedAt.toISOString(),
      correct: session.correct,
      incorrect: session.incorrect,
      durationMin: session.durationMin,
    })),
    practices: practices.map((practice) => ({
      subjectId: practice.subjectId,
      itemId: practice.itemId,
      at: practice.practicedAt.toISOString(),
    })),
    cardStats: cardPerformances.map((performance) => ({
      cardId: performance.cardId,
      subjectId: performance.subjectId,
      prompt: performance.card.prompt,
      answer: performance.card.answer,
      correct: performance.correctCount,
      incorrect: performance.incorrectCount,
    })),
  };

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-24 pt-16">
        <header>
          <p className="text-sm uppercase tracking-[0.4em] text-blue-300/80">
            Analytics
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-white">
            Learning progress
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            See whether you are improving, how consistent you have been, and
            what to focus on next.
          </p>
        </header>
        <AnalyticsDashboard data={data} />
      </section>
    </main>
  );
}

/**
 * The viewer's group and its members' recent activity, for the comparison.
 * Subjects that were not shared with the group are anonymised: members' totals
 * count, but which private subject they were on is not revealed.
 */
export async function loadGroup(
  userId: string,
  now: Date
): Promise<AnalyticsData["group"]> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          members: {
            select: { id: true, username: true, name: true },
            orderBy: { username: "asc" },
          },
          subjects: {
            select: { subject: { select: { id: true, title: true, type: true } } },
          },
        },
      },
    },
  });
  const group = me?.group;
  if (!group) return undefined;

  const since = new Date(now.getTime() - GROUP_HISTORY_DAYS * 86_400_000);
  const memberIds = group.members.map((member) => member.id);
  const sharedSubjects = group.subjects.map((entry) => entry.subject);
  const sharedIds = new Set(sharedSubjects.map((subject) => subject.id));
  const visible = (subjectId: string) => (sharedIds.has(subjectId) ? subjectId : "other");

  const [sessions, practices] = await Promise.all([
    prisma.studySession.findMany({
      where: { userId: { in: memberIds }, studiedAt: { gte: since } },
      orderBy: { studiedAt: "asc" },
      select: {
        userId: true,
        subjectId: true,
        studiedAt: true,
        correct: true,
        incorrect: true,
        durationMin: true,
      },
    }),
    prisma.checklistEntry.findMany({
      where: { userId: { in: memberIds }, practicedAt: { gte: since } },
      orderBy: { practicedAt: "asc" },
      select: { userId: true, subjectId: true, practicedAt: true },
    }),
  ]);

  return {
    name: group.name,
    members: group.members.map((member) => ({
      ...member,
      isYou: member.id === userId,
    })),
    sessions: sessions.map((session) => ({
      userId: session.userId,
      subjectId: visible(session.subjectId),
      at: session.studiedAt.toISOString(),
      correct: session.correct,
      incorrect: session.incorrect,
      durationMin: session.durationMin,
    })),
    practices: practices.map((practice) => ({
      userId: practice.userId,
      subjectId: visible(practice.subjectId),
      itemId: "",
      at: practice.practicedAt.toISOString(),
    })),
    sharedSubjects,
  };
}
