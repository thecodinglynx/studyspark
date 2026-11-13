"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { AccuracyLineChart } from "@/components/analytics/charts/accuracy-line-chart";
import { PracticeBarChart } from "@/components/analytics/charts/practice-bar-chart";
import { Panel } from "@/components/ui/panel";
import {
  MASTERED_MIN_ACCURACY,
  MASTERED_MIN_ATTEMPTS,
  NEGLECTED_AFTER_DAYS,
  activeDays,
  byNeedForAttention,
  cardsToReview,
  dayKey,
  daysBetween,
  describeDaysAgo,
  formatMinutes,
  lastWeekStarts,
  overview,
  subjectProgress,
  weekLabel,
  weeklyAccuracy,
  weeklyActiveDays,
  type CardStat,
  type PracticePoint,
  type SessionPoint,
  type SubjectInfo,
  type SubjectProgress,
} from "@/lib/analytics";

export interface AnalyticsData {
  /** When the page was built, so the server and browser agree on "today". */
  now: string;
  subjects: SubjectInfo[];
  sessions: SessionPoint[];
  practices: PracticePoint[];
  cardStats: CardStat[];
}

const WEEKS = 12;

const subscribeNever = () => () => {};

/**
 * The viewer's timezone, so "today" and "this week" mean what they mean to
 * them. The server builds the first HTML in UTC; React then switches to the
 * browser's zone without treating the difference as an error.
 */
function useViewerTimeZone(): string {
  return useSyncExternalStore(
    subscribeNever,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC"
  );
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const timeZone = useViewerTimeZone();

  const view = useMemo(() => {
    const today = dayKey(data.now, timeZone);
    const weeks = lastWeekStarts(today, WEEKS);
    const summary = overview(data.sessions, data.practices, data.now, timeZone);
    const days = activeDays(data.sessions, data.practices, timeZone);

    const progress = byNeedForAttention(
      data.subjects.map((subject) =>
        subjectProgress(
          subject,
          data.sessions,
          data.practices,
          data.cardStats,
          data.now,
          timeZone
        )
      )
    );

    const accuracyLines = data.subjects
      .filter((subject) => subject.type === "FLASHCARDS")
      .map((subject) => ({
        label: subject.title,
        data: weeklyAccuracy(
          data.sessions.filter((s) => s.subjectId === subject.id),
          weeks,
          timeZone
        ),
      }))
      .filter((line) => line.data.some((value) => value !== null));

    const review = data.subjects
      .filter((subject) => subject.type === "FLASHCARDS")
      .map((subject) => ({
        subject,
        cards: cardsToReview(
          data.cardStats.filter((c) => c.subjectId === subject.id)
        ),
      }))
      .filter((entry) => entry.cards.length > 0);

    return {
      today,
      summary,
      progress,
      weekLabels: weeks.map(weekLabel),
      daysPerWeek: weeklyActiveDays(days, weeks),
      accuracyLines,
      review,
    };
  }, [data, timeZone]);

  const { summary } = view;

  return (
    <div className="flex flex-col gap-12">
      {summary.hasAnyActivity ? (
        <section
          aria-label="Overview"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatTile
            label="Current streak"
            value={plural(summary.currentStreak, "day", "days")}
            note={
              summary.currentStreak === 0
                ? "Study today to start a new streak"
                : `Longest so far: ${plural(summary.longestStreak, "day", "days")}`
            }
          />
          <StatTile
            label="Days studied"
            value={String(summary.daysStudiedLast30)}
            note="in the last 30 days"
          />
          <StatTile
            label="Study time"
            value={formatMinutes(summary.minutesLast30)}
            note={`${plural(summary.sessionsLast30, "flashcard session", "flashcard sessions")} in the last 30 days`}
          />
          <StatTile
            label="Accuracy"
            value={
              summary.accuracyLast30 === null ? "—" : `${summary.accuracyLast30}%`
            }
            note="of answers right, last 30 days"
            change={summary.accuracyChange}
          />
        </section>
      ) : (
        <Panel className="bg-slate-900/70 p-8 text-center">
          <h2 className="text-lg font-semibold text-white">
            Nothing to show yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">
            Finish a flashcard session or log some checklist practice and your
            progress will appear here.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-flex rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
          >
            Go to your subjects
          </Link>
        </Panel>
      )}

      <Panel className="bg-slate-900/70 p-6">
        <h2 className="text-lg font-semibold text-white">
          Where to focus next
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Your subjects, starting with the ones you have studied least
          recently. A subject is flagged after {NEGLECTED_AFTER_DAYS} days
          without practice.
        </p>
        {view.progress.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            You have no subjects yet.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {view.progress.map((subject) => (
              <SubjectRow key={subject.id} subject={subject} />
            ))}
          </ul>
        )}
      </Panel>

      {summary.hasAnyActivity && (
        <div className="grid gap-8 lg:grid-cols-2">
          <Panel className="bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold text-white">
              Accuracy over time
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Share of answers you got right, per week. A rising line means it
              is sticking.
            </p>
            {view.accuracyLines.length > 0 ? (
              <div className="mt-6">
                <AccuracyLineChart
                  labels={view.weekLabels}
                  datasets={view.accuracyLines}
                />
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">
                Flashcard sessions will be charted here.
              </p>
            )}
          </Panel>

          <Panel className="bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold text-white">Consistency</h2>
            <p className="mt-2 text-sm text-slate-400">
              How many days each week you studied or practiced anything. Little
              and often beats cramming.
            </p>
            <div className="mt-6">
              <PracticeBarChart
                labels={view.weekLabels}
                datasets={[{ label: "Days studied", data: view.daysPerWeek }]}
              />
            </div>
          </Panel>
        </div>
      )}

      {view.review.length > 0 && (
        <Panel className="bg-slate-900/70 p-6">
          <h2 className="text-lg font-semibold text-white">Cards to review</h2>
          <p className="mt-2 text-sm text-slate-400">
            Cards you still miss at least as often as you get right. Cards you
            have since got the hang of are not listed.
          </p>
          <div className="mt-6 flex flex-col gap-8">
            {view.review.map(({ subject, cards }) => (
              <div key={subject.id}>
                <h3 className="text-base font-semibold text-white">
                  {subject.title}
                </h3>
                <ol className="mt-3 flex flex-col gap-3">
                  {cards.map((card) => (
                    <li
                      key={card.cardId}
                      className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="whitespace-pre-wrap font-medium text-white">
                          {card.prompt}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-slate-300">
                          {card.answer}
                        </p>
                      </div>
                      <span className="whitespace-nowrap rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-200">
                        Right {card.correct} of {card.attempts} ({card.accuracy}
                        %)
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {view.progress.some((subject) => subject.checklist) && (
        <Panel className="bg-slate-900/70 p-6">
          <h2 className="text-lg font-semibold text-white">
            Checklist items to practice next
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Items you have not done in the longest time, or ever.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {view.progress
              .filter((subject) => subject.checklist)
              .map((subject) => (
                <div
                  key={subject.id}
                  className="rounded-2xl border border-white/5 bg-white/5 p-5"
                >
                  <h3 className="text-base font-semibold text-white">
                    {subject.title}
                  </h3>
                  {subject.checklist!.totalItems === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">
                      No checklist items yet.
                    </p>
                  ) : (
                    <ol className="mt-3 flex flex-col gap-2 text-sm">
                      {subject.checklist!.next.slice(0, 5).map((item) => (
                        <li
                          key={item.id}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <span className="text-slate-100">{item.title}</span>
                          <span
                            className={`whitespace-nowrap text-xs ${
                              item.lastDay === null
                                ? "text-amber-300"
                                : "text-slate-400"
                            }`}
                          >
                            {item.lastDay === null
                              ? "Never practiced"
                              : describeDaysAgo(
                                  daysBetween(item.lastDay, view.today)
                                )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  note,
  change,
}: {
  label: string;
  value: string;
  note: string;
  /** Percentage points against the previous period; null hides the line. */
  change?: number | null;
}) {
  return (
    <Panel className="bg-slate-900/70 p-5">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
      {change !== undefined && (
        <p
          className={`mt-2 text-sm font-medium ${
            change === null
              ? "text-slate-500"
              : change > 0
                ? "text-emerald-300"
                : change < 0
                  ? "text-rose-300"
                  : "text-slate-300"
          }`}
        >
          {change === null
            ? "No earlier sessions to compare"
            : change === 0
              ? "No change from the 30 days before"
              : `${change > 0 ? "▲" : "▼"} ${plural(Math.abs(change), "point", "points")} ${
                  change > 0 ? "up" : "down"
                } on the 30 days before`}
        </p>
      )}
    </Panel>
  );
}

function SubjectRow({ subject }: { subject: SubjectProgress }) {
  const { flashcards, checklist } = subject;

  return (
    <li className="rounded-2xl border border-white/5 bg-white/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-white">
            {subject.title}
          </h3>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-200">
            {subject.type === "FLASHCARDS" ? "Flashcards" : "Checklist"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-300">
            Last practiced: {describeDaysAgo(subject.daysSince)}
          </span>
          {subject.neglected && subject.daysSince !== null && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-200">
              Not practiced in {subject.daysSince} days
            </span>
          )}
        </div>
      </div>

      {flashcards && (
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <MasteryBar mastery={flashcards.mastery} />
          <p className="text-slate-300">
            {flashcards.accuracy === null
              ? "No answers in the last 30 days."
              : `${flashcards.accuracy}% of answers right in the last 30 days (${plural(flashcards.sessionsLast30, "session", "sessions")}).`}
          </p>
          <TrendLine trend={flashcards.trend} />
        </div>
      )}

      {checklist && (
        <div className="mt-4 flex flex-col gap-2 text-sm text-slate-300">
          <p>
            {checklist.totalItems === 0
              ? "No checklist items yet."
              : `${checklist.practicedLast14} of ${plural(checklist.totalItems, "item", "items")} practiced in the last 14 days.`}
          </p>
          {checklist.totalItems > 0 && (
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-700"
              role="img"
              aria-label={`${checklist.practicedLast14} of ${checklist.totalItems} items practiced recently`}
            >
              <div
                className="h-full bg-emerald-400"
                style={{
                  width: `${(checklist.practicedLast14 / checklist.totalItems) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function MasteryBar({
  mastery,
}: {
  mastery: { mastered: number; learning: number; fresh: number; total: number };
}) {
  if (mastery.total === 0) {
    return <p className="text-slate-400">No cards yet.</p>;
  }
  const percent = (count: number) => `${(count / mastery.total) * 100}%`;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-slate-700"
        role="img"
        aria-label={`${mastery.mastered} mastered, ${mastery.learning} still learning, ${mastery.fresh} not started, out of ${mastery.total} cards`}
      >
        <div className="bg-emerald-400" style={{ width: percent(mastery.mastered) }} />
        <div className="bg-amber-400" style={{ width: percent(mastery.learning) }} />
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          <span className="text-emerald-300">{mastery.mastered}</span> mastered
        </span>
        <span>
          <span className="text-amber-300">{mastery.learning}</span> still
          learning
        </span>
        <span>
          <span className="text-slate-200">{mastery.fresh}</span> not started
        </span>
        <span
          className="text-slate-500"
          title={`Mastered means answered right at least ${Math.round(MASTERED_MIN_ACCURACY * 100)}% of the time over at least ${MASTERED_MIN_ATTEMPTS} attempts.`}
        >
          (what is mastered? ≥{Math.round(MASTERED_MIN_ACCURACY * 100)}% right
          over {MASTERED_MIN_ATTEMPTS}+ tries)
        </span>
      </p>
    </div>
  );
}

function TrendLine({
  trend,
}: {
  trend: NonNullable<SubjectProgress["flashcards"]>["trend"];
}) {
  if (!trend) {
    return (
      <p className="text-slate-500">
        Trend appears after a few more sessions.
      </p>
    );
  }
  const text =
    trend.direction === "up"
      ? `▲ Improving: ${trend.recent}% right lately, up from ${trend.earlier}% before.`
      : trend.direction === "down"
        ? `▼ Slipping: ${trend.recent}% right lately, down from ${trend.earlier}% before.`
        : `Steady: about ${trend.recent}% right, much the same as before.`;
  const color =
    trend.direction === "up"
      ? "text-emerald-300"
      : trend.direction === "down"
        ? "text-rose-300"
        : "text-slate-300";
  return <p className={color}>{text}</p>;
}
