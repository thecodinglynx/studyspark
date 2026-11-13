import {
  activeDays,
  addDays,
  daysBetween,
  dayKey,
  overview,
  type PracticePoint,
  type SessionPoint,
} from "@/lib/analytics";

/**
 * Group statistics and the comparison between members. Like lib/analytics,
 * everything is a pure function and every "day" is in the viewer's timezone.
 * Only totals are produced here, never individual answers.
 */

export interface GroupMember {
  id: string;
  username: string;
  name: string | null;
  isYou: boolean;
}

export interface MemberSession extends SessionPoint {
  userId: string;
}

export interface MemberPractice extends PracticePoint {
  userId: string;
}

export interface MemberStats {
  member: GroupMember;
  currentStreak: number;
  daysStudiedLast30: number;
  sessionsLast30: number;
  minutesLast30: number;
  accuracyLast30: number | null;
  /** Calendar day of the latest activity, or null if none. */
  lastDay: string | null;
  daysSince: number | null;
  /** Studied or practiced at any point in the last 7 days, including today. */
  activeThisWeek: boolean;
}

/** One entry per member, most days studied in the last 30 days first. */
export function memberStats(
  members: GroupMember[],
  sessions: MemberSession[],
  practices: MemberPractice[],
  now: string,
  timeZone: string
): MemberStats[] {
  const today = dayKey(now, timeZone);
  const weekStart = addDays(today, -6);

  const stats = members.map((member): MemberStats => {
    const mine = sessions.filter((s) => s.userId === member.id);
    const myPractices = practices.filter((p) => p.userId === member.id);
    const summary = overview(mine, myPractices, now, timeZone);
    const days = Array.from(activeDays(mine, myPractices, timeZone)).sort();
    const lastDay = days.length > 0 ? days[days.length - 1] : null;

    return {
      member,
      currentStreak: summary.currentStreak,
      daysStudiedLast30: summary.daysStudiedLast30,
      sessionsLast30: summary.sessionsLast30,
      minutesLast30: summary.minutesLast30,
      accuracyLast30: summary.accuracyLast30,
      lastDay,
      daysSince: lastDay === null ? null : daysBetween(lastDay, today),
      activeThisWeek: lastDay !== null && lastDay >= weekStart && lastDay <= today,
    };
  });

  return stats.sort(
    (a, b) =>
      b.daysStudiedLast30 - a.daysStudiedLast30 ||
      b.minutesLast30 - a.minutesLast30 ||
      a.member.username.localeCompare(b.member.username)
  );
}

export interface GroupSummary {
  memberCount: number;
  activeThisWeek: number;
  sessionsLast30: number;
  minutesLast30: number;
  /** Share of all the group's answers in the last 30 days that were right. */
  accuracyLast30: number | null;
  /** The average member's days studied in the last 30 days, to one decimal. */
  averageDaysStudied: number;
  you: MemberStats | null;
}

export function groupSummary(
  stats: MemberStats[],
  sessions: MemberSession[],
  now: string,
  timeZone: string
): GroupSummary {
  const today = dayKey(now, timeZone);
  const start = addDays(today, -29);

  let correct = 0;
  let incorrect = 0;
  for (const session of sessions) {
    const day = dayKey(session.at, timeZone);
    if (day >= start && day <= today) {
      correct += session.correct;
      incorrect += session.incorrect;
    }
  }
  const answers = correct + incorrect;

  const totalDays = stats.reduce((sum, s) => sum + s.daysStudiedLast30, 0);

  return {
    memberCount: stats.length,
    activeThisWeek: stats.filter((s) => s.activeThisWeek).length,
    sessionsLast30: stats.reduce((sum, s) => sum + s.sessionsLast30, 0),
    minutesLast30: stats.reduce((sum, s) => sum + s.minutesLast30, 0),
    accuracyLast30: answers === 0 ? null : Math.round((correct / answers) * 100),
    averageDaysStudied:
      stats.length === 0 ? 0 : Math.round((totalDays / stats.length) * 10) / 10,
    you: stats.find((s) => s.member.isYou) ?? null,
  };
}

export interface SubjectComparisonRow {
  member: GroupMember;
  /** Flashcard sessions in the last 30 days. */
  sessions: number;
  /** Percent of answers right in the last 30 days, or null if none. */
  accuracy: number | null;
  /** Checklist practices in the last 30 days. */
  practices: number;
  lastDay: string | null;
}

export interface SubjectComparison {
  id: string;
  title: string;
  type: "FLASHCARDS" | "CHECKLIST";
  rows: SubjectComparisonRow[];
}

/**
 * How each member is getting on with each subject shared with the group.
 * Members with the most activity come first.
 */
export function subjectComparisons(
  subjects: Array<{ id: string; title: string; type: "FLASHCARDS" | "CHECKLIST" }>,
  members: GroupMember[],
  sessions: MemberSession[],
  practices: MemberPractice[],
  now: string,
  timeZone: string
): SubjectComparison[] {
  const today = dayKey(now, timeZone);
  const start = addDays(today, -29);

  return subjects.map((subject) => {
    const rows = members.map((member): SubjectComparisonRow => {
      const mine = sessions.filter(
        (s) => s.userId === member.id && s.subjectId === subject.id
      );
      const myPractices = practices.filter(
        (p) => p.userId === member.id && p.subjectId === subject.id
      );
      const recent = mine.filter((s) => dayKey(s.at, timeZone) >= start);
      const correct = recent.reduce((n, s) => n + s.correct, 0);
      const incorrect = recent.reduce((n, s) => n + s.incorrect, 0);
      const days = [
        ...mine.map((s) => dayKey(s.at, timeZone)),
        ...myPractices.map((p) => dayKey(p.at, timeZone)),
      ].sort();

      return {
        member,
        sessions: recent.length,
        accuracy:
          correct + incorrect === 0
            ? null
            : Math.round((correct / (correct + incorrect)) * 100),
        practices: myPractices.filter((p) => dayKey(p.at, timeZone) >= start)
          .length,
        lastDay: days.length > 0 ? days[days.length - 1] : null,
      };
    });

    rows.sort((a, b) =>
      subject.type === "FLASHCARDS"
        ? b.sessions - a.sessions ||
          (b.accuracy ?? -1) - (a.accuracy ?? -1) ||
          a.member.username.localeCompare(b.member.username)
        : b.practices - a.practices ||
          a.member.username.localeCompare(b.member.username)
    );

    return { id: subject.id, title: subject.title, type: subject.type, rows };
  });
}

/** What to call a member: their name if they have one, else their username. */
export function memberLabel(member: GroupMember): string {
  return member.name?.trim() || member.username;
}
