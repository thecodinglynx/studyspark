import { prisma } from "@/lib/prisma";
import { TopNav } from "@/components/top-nav";
import { Panel } from "@/components/ui/panel";
import { SubjectPieChart } from "@/components/analytics/charts/subject-pie-chart";
import { PracticeBarChart } from "@/components/analytics/charts/practice-bar-chart";

interface AnalyticsViewProps {
  userId: string;
}

type ChecklistEntryRecord = {
  id: string;
  practicedAt: Date;
};

type ChecklistItemRecord = {
  id: string;
  title: string;
  entries: ChecklistEntryRecord[];
};

type StudySessionRecord = {
  studiedAt: Date;
  correct: number;
  incorrect: number;
};

type CardPerformanceDetail = {
  correctCount: number;
  incorrectCount: number;
  card: {
    id: string;
    prompt: string;
    answer: string;
  } | null;
};

type SubjectAnalyticsRecord = {
  id: string;
  title: string;
  type: "FLASHCARDS" | "CHECKLIST";
  updatedAt: Date;
  _count: {
    cards: number;
    sessions: number;
    checklistEntries: number;
  };
  sessions: StudySessionRecord[];
  checklistEntries: ChecklistEntryRecord[];
  checklistItems: ChecklistItemRecord[];
  cardPerformances: CardPerformanceDetail[];
};

const MONTH_WINDOW = 12;

function buildMonthBuckets(): Array<{
  label: string;
  month: number;
  year: number;
}> {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return Array.from({ length: MONTH_WINDOW }, (_, offset) => {
    const date = new Date(now);
    date.setMonth(date.getMonth() - (MONTH_WINDOW - 1 - offset));
    date.setDate(1);

    const label = `${date.toLocaleString(undefined, {
      month: "short",
    })} ${date.getFullYear()}`;

    return {
      label,
      month: date.getMonth(),
      year: date.getFullYear(),
    };
  });
}

function getMonthStart(): Date {
  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);
  anchor.setMonth(anchor.getMonth() - (MONTH_WINDOW - 1));
  anchor.setDate(1);
  return anchor;
}

export async function AnalyticsView({ userId }: AnalyticsViewProps) {
  const periodStart = getMonthStart();

  const subjects = (await prisma.subject.findMany({
    where: {
      OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
    },
    include: {
      _count: {
        select: {
          cards: true,
          sessions: true,
          checklistEntries: true,
        },
      },
      sessions: {
        where: { userId, studiedAt: { gte: periodStart } },
        orderBy: { studiedAt: "asc" },
        select: {
          studiedAt: true,
          correct: true,
          incorrect: true,
        },
      },
      checklistEntries: {
        where: { userId, practicedAt: { gte: periodStart } },
        orderBy: { practicedAt: "asc" },
        select: {
          id: true,
          practicedAt: true,
        },
      },
      checklistItems: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          entries: {
            where: { userId, practicedAt: { gte: periodStart } },
            select: { id: true, practicedAt: true },
          },
        },
      },
      cardPerformances: {
        where: { userId },
        include: {
          card: {
            select: {
              id: true,
              prompt: true,
              answer: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  })) as unknown as SubjectAnalyticsRecord[];

  const monthBuckets = buildMonthBuckets();

  const pieSlices = subjects.map((subject) => {
    if (subject.type === "FLASHCARDS") {
      const sessionCount = subject.sessions.length;
      return { label: subject.title, value: sessionCount };
    }

    const completions = subject.checklistEntries.length;
    return { label: subject.title, value: completions };
  });

  const histogramDatasets = subjects.map((subject) => {
    const monthlyCounts = new Array(monthBuckets.length).fill(0);

    subject.sessions.forEach((session) => {
      const timestamp = new Date(session.studiedAt);
      const monthIndex = monthBuckets.findIndex(
        (bucket) =>
          bucket.month === timestamp.getMonth() &&
          bucket.year === timestamp.getFullYear()
      );

      if (monthIndex >= 0) {
        monthlyCounts[monthIndex] += 1;
      }
    });

    subject.checklistEntries.forEach((entry) => {
      const timestamp = new Date(entry.practicedAt);
      const monthIndex = monthBuckets.findIndex(
        (bucket) =>
          bucket.month === timestamp.getMonth() &&
          bucket.year === timestamp.getFullYear()
      );

      if (monthIndex >= 0) {
        monthlyCounts[monthIndex] += 1;
      }
    });

    return {
      label: subject.title,
      data: monthlyCounts,
    };
  });

  const hasHistogramData = histogramDatasets.some((dataset) =>
    dataset.data.some((value) => value > 0)
  );

  const checklistHighlights = subjects
    .filter((subject) => subject.type === "CHECKLIST")
    .map((subject) => {
      const itemsWithFrequency = subject.checklistItems.map((item) => ({
        id: item.id,
        title: item.title,
        count: item.entries.length,
      }));

      const sorted = [...itemsWithFrequency].sort((a, b) => b.count - a.count);

      return {
        subjectTitle: subject.title,
        totalItems: itemsWithFrequency.length,
        mostFrequent: sorted[0] ?? null,
        leastFrequent: sorted[sorted.length - 1] ?? null,
      };
    });

  const flashcardFailureHighlights = subjects
    .filter((subject) => subject.type === "FLASHCARDS")
    .map((subject) => {
      const rankedCards = subject.cardPerformances
        .filter((performance) => performance.card !== null)
        .map((performance) => ({
          id: performance.card!.id,
          prompt: performance.card!.prompt,
          answer: performance.card!.answer,
          incorrect: performance.incorrectCount,
          correct: performance.correctCount,
        }))
        .filter((card) => card.incorrect > 0)
        .sort((a, b) => b.incorrect - a.incorrect)
        .slice(0, 20);

      return {
        subjectTitle: subject.title,
        cards: rankedCards,
      };
    })
    .filter((entry) => entry.cards.length > 0);

  const hasPieData = pieSlices.some((slice) => slice.value > 0);

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-6xl flex-col gap-12 px-4 pb-24 pt-16">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-blue-300/80">
              Analytics
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-white">
              Learning progress
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Visualize how you study across subjects, uncover streaks, and spot
              checklist items that need attention.
            </p>
          </div>
        </header>

        <Panel className="bg-slate-900/70 p-6">
          <h2 className="text-lg font-semibold text-white">Practice mix</h2>
          <p className="mt-2 text-sm text-slate-400">
            Breakdown of completed practice sessions (and checklist runs) by
            subject.
          </p>
          {hasPieData ? (
            <div className="mt-6">
              <SubjectPieChart data={pieSlices} />
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-500">
              No practice data yet. Complete a study session or checklist run to
              populate this chart.
            </p>
          )}
        </Panel>

        <Panel className="bg-slate-900/70 p-6">
          <h2 className="text-lg font-semibold text-white">Monthly practice</h2>
          <p className="mt-2 text-sm text-slate-400">
            Sessions and checklist completions across the last 12 months.
          </p>
          {hasHistogramData ? (
            <div className="mt-6">
              <PracticeBarChart
                labels={monthBuckets.map((bucket) => bucket.label)}
                datasets={histogramDatasets}
              />
            </div>
          ) : (
            <p className="mt-6 text-sm text-slate-500">
              No recent practice yet. Once you study, we’ll chart your activity
              here.
            </p>
          )}
        </Panel>

        {flashcardFailureHighlights.length > 0 && (
          <Panel className="bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold text-white">
              Most missed flashcards
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Top 20 incorrect cards per subject so you can focus future review
              sessions.
            </p>
            <div className="mt-6 space-y-6">
              {flashcardFailureHighlights.map((highlight) => (
                <div key={highlight.subjectTitle} className="space-y-4">
                  <h3 className="text-base font-semibold text-white">
                    {highlight.subjectTitle}
                  </h3>
                  <ol className="space-y-4">
                    {highlight.cards.map((card) => (
                      <li
                        key={card.id}
                        className="rounded-2xl border border-white/5 bg-white/5 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-rose-200">
                              Missed {card.incorrect}
                            </span>
                            {card.correct > 0 && (
                              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">
                                Correct {card.correct}
                              </span>
                            )}
                          </div>
                          <span className="min-w-[10rem] flex-1 whitespace-pre-wrap font-medium text-white">
                            {card.prompt}
                          </span>
                          <span
                            className="hidden text-slate-400 sm:inline"
                            aria-hidden="true"
                          >
                            →
                          </span>
                          <span className="min-w-[10rem] flex-1 whitespace-pre-wrap text-slate-200">
                            {card.answer}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {checklistHighlights.length > 0 && (
          <Panel className="bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold text-white">
              Checklist highlights
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Items you complete most—and least—often for each checklist
              subject.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {checklistHighlights.map((highlight) => (
                <div
                  key={highlight.subjectTitle}
                  className="rounded-2xl border border-white/5 bg-white/5 p-5"
                >
                  <h3 className="text-base font-semibold text-white">
                    {highlight.subjectTitle}
                  </h3>
                  {highlight.totalItems === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">
                      No checklist items yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3 text-sm text-slate-300">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                          Most frequent
                        </p>
                        {highlight.mostFrequent ? (
                          <p className="mt-1">
                            {highlight.mostFrequent.title} (
                            {highlight.mostFrequent.count} completions)
                          </p>
                        ) : (
                          <p className="mt-1 text-slate-400">
                            No completions yet.
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-rose-300">
                          Least frequent
                        </p>
                        {highlight.leastFrequent ? (
                          <p className="mt-1">
                            {highlight.leastFrequent.title} (
                            {highlight.leastFrequent.count} completions)
                          </p>
                        ) : (
                          <p className="mt-1 text-slate-400">
                            No completions yet.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </section>
    </main>
  );
}
