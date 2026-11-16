"use client";

import { useState } from "react";
import { PracticeBarChart } from "@/components/analytics/charts/practice-bar-chart";
import { RankBarChart } from "@/components/analytics/charts/rank-bar-chart";
import { Panel } from "@/components/ui/panel";
import {
  dayKey,
  daysBetween,
  describeDaysAgo,
  formatMinutes,
  lastWeekStarts,
  weekLabel,
} from "@/lib/analytics";
import {
  groupSummary,
  memberLabel,
  memberStats,
  subjectComparisons,
  weeklyActiveMembers,
  type GroupMember,
  type MemberPractice,
  type MemberSession,
} from "@/lib/group-analytics";

export interface GroupAnalyticsData {
  name: string;
  members: GroupMember[];
  /** Everyone's sessions. Subjects not shared with the group are anonymised. */
  sessions: MemberSession[];
  practices: MemberPractice[];
  /** Subjects shared with the group: the ones members can be compared on. */
  sharedSubjects: Array<{ id: string; title: string; type: "FLASHCARDS" | "CHECKLIST" }>;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const percent = (value: number | null) => (value === null ? "—" : `${value}%`);

/** How many weeks the group activity chart covers. */
const WEEKS = 12;

type Metric = "days" | "time" | "accuracy";

const METRICS: Array<{ id: Metric; label: string; measure: string }> = [
  { id: "days", label: "Days studied", measure: "Days studied" },
  { id: "time", label: "Study time", measure: "Study time" },
  { id: "accuracy", label: "Accuracy", measure: "Accuracy" },
];

/** Biggest first; people with nothing to show yet (null) go last. */
function byValueDesc<T>(rows: T[], value: (row: T) => number | null): T[] {
  return [...rows].sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1));
}

/**
 * How the group is doing and how the viewer compares with the others in it.
 * Only totals appear here; nobody's individual answers are shown.
 */
export function GroupAnalytics({
  group,
  now,
  timeZone,
}: {
  group: GroupAnalyticsData;
  now: string;
  timeZone: string;
}) {
  const stats = memberStats(group.members, group.sessions, group.practices, now, timeZone);
  const summary = groupSummary(stats, group.sessions, now, timeZone);
  const comparisons = subjectComparisons(
    group.sharedSubjects,
    group.members,
    group.sessions,
    group.practices,
    now,
    timeZone
  );
  const today = dayKey(now, timeZone);
  const [metric, setMetric] = useState<Metric>("days");
  const weeks = lastWeekStarts(today, WEEKS);
  const activeMembers = weeklyActiveMembers(
    group.members,
    group.sessions,
    group.practices,
    weeks,
    timeZone
  );
  const metricValue = (row: (typeof stats)[number]) =>
    metric === "days"
      ? row.daysStudiedLast30
      : metric === "time"
        ? row.minutesLast30
        : row.accuracyLast30;
  const ranked = byValueDesc(stats, metricValue);
  const quiet = summary.sessionsLast30 === 0 && stats.every((s) => s.daysStudiedLast30 === 0);

  return (
    <section
      id="group"
      aria-labelledby="group-heading"
      className="flex scroll-mt-24 flex-col gap-8"
    >
      <div>
        <h2 id="group-heading" className="text-2xl font-semibold text-white">
          Your group: {group.name}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          How the group is doing, and how you compare. Only totals are shown,
          never anyone&apos;s individual answers.
        </p>
        {summary.memberCount === 1 && (
          <p className="mt-3 text-sm text-slate-300">
            You are the only member of this group so far.
          </p>
        )}
      </div>

      <div
        role="group"
        aria-label="Group overview"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Tile
          label="Active this week"
          value={`${summary.activeThisWeek} of ${summary.memberCount}`}
          note="members studied in the last 7 days"
        />
        <Tile
          label="Group study time"
          value={formatMinutes(summary.minutesLast30)}
          note={`${plural(summary.sessionsLast30, "flashcard session", "flashcard sessions")} in the last 30 days`}
        />
        <Tile
          label="Group accuracy"
          value={percent(summary.accuracyLast30)}
          note={
            summary.you
              ? `You: ${percent(summary.you.accuracyLast30)} · last 30 days`
              : "of answers right, last 30 days"
          }
        />
        <Tile
          label="Your days studied"
          value={String(summary.you?.daysStudiedLast30 ?? 0)}
          note={`Group average: ${summary.averageDaysStudied} · last 30 days`}
        />
      </div>

      {quiet ? (
        <Panel className="bg-slate-900/70 p-6 text-sm text-slate-300">
          Nobody in the group has studied in the last 30 days yet.
        </Panel>
      ) : (
        <Panel className="bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold text-white">How you compare</h3>
          <p className="mt-2 text-sm text-slate-400">
            The last 30 days. Your bar is highlighted.
          </p>
          <div
            role="group"
            aria-label="Compare members by"
            className="mt-4 flex flex-wrap gap-2"
          >
            {METRICS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={metric === option.id}
                onClick={() => setMetric(option.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  metric === option.id
                    ? "bg-blue-500 text-white"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-6">
            <RankBarChart
              measure={METRICS.find((option) => option.id === metric)!.measure}
              labels={ranked.map((row) => memberLabel(row.member))}
              values={ranked.map(metricValue)}
              highlight={ranked.findIndex((row) => row.member.isYou)}
              format={
                metric === "time"
                  ? (value) => formatMinutes(value)
                  : metric === "accuracy"
                    ? (value) => `${value}%`
                    : undefined
              }
              max={metric === "accuracy" ? 100 : undefined}
            />
          </div>
          <details className="group mt-6">
            <summary className="cursor-pointer text-sm font-medium text-blue-300 hover:text-blue-200">
              Show everything as a table
            </summary>
            <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">
                Study activity of each member of {group.name}
              </caption>
              <thead className="text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th scope="col" className="pb-3 pr-4 font-medium">Member</th>
                  <th scope="col" className="pb-3 pr-4 font-medium">Streak</th>
                  <th scope="col" className="pb-3 pr-4 font-medium">Days studied</th>
                  <th scope="col" className="pb-3 pr-4 font-medium">Study time</th>
                  <th scope="col" className="pb-3 pr-4 font-medium">Accuracy</th>
                  <th scope="col" className="pb-3 font-medium">Last studied</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => (
                  <tr
                    key={row.member.id}
                    className={`border-t border-white/5 ${
                      row.member.isYou ? "bg-blue-500/10" : ""
                    }`}
                  >
                    <th scope="row" className="py-3 pr-4 font-medium text-white">
                      {memberLabel(row.member)}
                      {row.member.isYou && (
                        <span className="ml-2 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-200">
                          You
                        </span>
                      )}
                    </th>
                    <td className="py-3 pr-4 text-slate-200">
                      {plural(row.currentStreak, "day", "days")}
                    </td>
                    <td className="py-3 pr-4 text-slate-200">{row.daysStudiedLast30}</td>
                    <td className="py-3 pr-4 text-slate-200">
                      {formatMinutes(row.minutesLast30)}
                    </td>
                    <td className="py-3 pr-4 text-slate-200">
                      {percent(row.accuracyLast30)}
                    </td>
                    <td className="py-3 text-slate-300">
                      {row.daysSince === null
                        ? "No activity yet"
                        : describeDaysAgo(row.daysSince)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </details>
        </Panel>
      )}

      {!quiet && (
        <Panel className="bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold text-white">Group activity</h3>
          <p className="mt-2 text-sm text-slate-400">
            How many members studied or practiced each week, out of{" "}
            {group.members.length}.
          </p>
          <div className="mt-6">
            <PracticeBarChart
              labels={weeks.map(weekLabel)}
              datasets={[{ label: "Members active", data: activeMembers }]}
            />
          </div>
        </Panel>
      )}

      {comparisons.length > 0 && (
        <Panel className="bg-slate-900/70 p-6">
          <h3 className="text-lg font-semibold text-white">
            Shared subjects
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            How each member is getting on with the subjects shared with the
            group, over the last 30 days.
          </p>
          <div className="mt-6 flex flex-col gap-8">
            {comparisons.map((subject) => (
              <div key={subject.id}>
                <h4 className="text-base font-semibold text-white">
                  {subject.title}
                </h4>
                <div className="mt-4">
                  <SubjectChart subject={subject} />
                </div>
                <details className="group mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-blue-300 hover:text-blue-200">
                    Show as a table
                  </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[24rem] text-left text-sm">
                    <caption className="sr-only">
                      Each member&apos;s progress on {subject.title}
                    </caption>
                    <thead className="text-xs uppercase tracking-wider text-slate-400">
                      <tr>
                        <th scope="col" className="pb-2 pr-4 font-medium">Member</th>
                        {subject.type === "FLASHCARDS" ? (
                          <>
                            <th scope="col" className="pb-2 pr-4 font-medium">Sessions</th>
                            <th scope="col" className="pb-2 pr-4 font-medium">Accuracy</th>
                          </>
                        ) : (
                          <th scope="col" className="pb-2 pr-4 font-medium">Practices</th>
                        )}
                        <th scope="col" className="pb-2 font-medium">Last</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subject.rows.map((row) => (
                        <tr
                          key={row.member.id}
                          className={`border-t border-white/5 ${
                            row.member.isYou ? "bg-blue-500/10" : ""
                          }`}
                        >
                          <th scope="row" className="py-2 pr-4 font-medium text-white">
                            {memberLabel(row.member)}
                            {row.member.isYou && (
                              <span className="ml-2 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-200">
                                You
                              </span>
                            )}
                          </th>
                          {subject.type === "FLASHCARDS" ? (
                            <>
                              <td className="py-2 pr-4 text-slate-200">{row.sessions}</td>
                              <td className="py-2 pr-4 text-slate-200">{percent(row.accuracy)}</td>
                            </>
                          ) : (
                            <td className="py-2 pr-4 text-slate-200">{row.practices}</td>
                          )}
                          <td className="py-2 text-slate-300">
                            {row.lastDay === null
                              ? "Never"
                              : describeDaysAgo(daysBetween(row.lastDay, today))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </details>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Panel className="bg-slate-900/70 p-5">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </Panel>
  );
}

function SubjectChart({
  subject,
}: {
  subject: ReturnType<typeof subjectComparisons>[number];
}) {
  const flashcards = subject.type === "FLASHCARDS";
  const value = (row: (typeof subject.rows)[number]) =>
    flashcards ? row.accuracy : row.practices;
  const rows = byValueDesc(subject.rows, value);

  return (
    <RankBarChart
      measure={flashcards ? "Accuracy" : "Practices"}
      labels={rows.map((row) => memberLabel(row.member))}
      values={rows.map(value)}
      highlight={rows.findIndex((row) => row.member.isYou)}
      format={flashcards ? (count) => `${count}%` : undefined}
      max={flashcards ? 100 : undefined}
    />
  );
}
