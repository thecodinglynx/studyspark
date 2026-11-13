/**
 * Calculations behind the Analytics page. Everything here is a pure function
 * of the study history it is given, and every "day" is a calendar day in the
 * timezone passed in, so the numbers match the viewer's own sense of "today".
 */

export interface SessionPoint {
  subjectId: string;
  /** ISO timestamp of when the study run was saved. */
  at: string;
  correct: number;
  incorrect: number;
  durationMin: number;
}

export interface PracticePoint {
  subjectId: string;
  itemId: string;
  /** ISO timestamp of when the item was logged as practiced. */
  at: string;
}

export interface CardStat {
  cardId: string;
  subjectId: string;
  prompt: string;
  answer: string;
  correct: number;
  incorrect: number;
}

export interface SubjectInfo {
  id: string;
  title: string;
  type: "FLASHCARDS" | "CHECKLIST";
  cardCount: number;
  items: Array<{ id: string; title: string }>;
}

/** A card counts as mastered after this many attempts at this accuracy. */
export const MASTERED_MIN_ATTEMPTS = 3;
export const MASTERED_MIN_ACCURACY = 0.8;

/** A subject with no activity for this long is flagged as neglected. */
export const NEGLECTED_AFTER_DAYS = 14;

/** Accuracy changes smaller than this many points are called "steady". */
const STEADY_BAND_POINTS = 5;
/** Sessions at the end of the history that count as "recent" for the trend. */
const RECENT_SESSIONS = 3;
/** Fewest answers on each side of the trend comparison, to avoid noise. */
const TREND_MIN_ATTEMPTS = 5;

// ---------------------------------------------------------------- days

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day ("2026-11-12") a moment falls on in a timezone. */
export function dayKey(value: string | Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter.format(typeof value === "string" ? new Date(value) : value);
}

function parseDay(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(key: string, days: number): string {
  return new Date(parseDay(key) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / 86_400_000);
}

/** The Monday of the week a day falls in. */
export function weekStart(key: string): string {
  const weekday = new Date(parseDay(key)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((weekday + 6) % 7));
}

/** The Monday of each of the last `count` weeks, oldest first. */
export function lastWeekStarts(today: string, count: number): string[] {
  const current = weekStart(today);
  return Array.from({ length: count }, (_, index) =>
    addDays(current, -7 * (count - 1 - index))
  );
}

// ------------------------------------------------------------- streaks

/** Days on which anything at all was studied or practiced. */
export function activeDays(
  sessions: SessionPoint[],
  practices: PracticePoint[],
  timeZone: string
): Set<string> {
  const days = new Set<string>();
  for (const session of sessions) days.add(dayKey(session.at, timeZone));
  for (const practice of practices) days.add(dayKey(practice.at, timeZone));
  return days;
}

/**
 * Consecutive active days up to today. A streak is still alive if today has
 * not been studied yet but yesterday was, so it does not read as broken
 * before the day is over.
 */
export function currentStreak(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(days: Set<string>): number {
  const sorted = Array.from(days).sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

// ------------------------------------------------------ accuracy & time

function accuracyOf(correct: number, incorrect: number): number | null {
  const attempts = correct + incorrect;
  return attempts === 0 ? null : Math.round((correct / attempts) * 100);
}

export interface Overview {
  currentStreak: number;
  longestStreak: number;
  daysStudiedLast30: number;
  sessionsLast30: number;
  minutesLast30: number;
  accuracyLast30: number | null;
  accuracyPrevious30: number | null;
  /** Percentage points up or down against the 30 days before. */
  accuracyChange: number | null;
  hasAnyActivity: boolean;
}

export function overview(
  sessions: SessionPoint[],
  practices: PracticePoint[],
  now: string,
  timeZone: string
): Overview {
  const today = dayKey(now, timeZone);
  const start = addDays(today, -29);
  const previousStart = addDays(today, -59);
  const days = activeDays(sessions, practices, timeZone);

  let sessionsLast30 = 0;
  let minutes = 0;
  const totals = { correct: 0, incorrect: 0 };
  const previous = { correct: 0, incorrect: 0 };

  for (const session of sessions) {
    const day = dayKey(session.at, timeZone);
    if (day >= start && day <= today) {
      sessionsLast30 += 1;
      minutes += session.durationMin;
      totals.correct += session.correct;
      totals.incorrect += session.incorrect;
    } else if (day >= previousStart && day < start) {
      previous.correct += session.correct;
      previous.incorrect += session.incorrect;
    }
  }

  const accuracyLast30 = accuracyOf(totals.correct, totals.incorrect);
  const accuracyPrevious30 = accuracyOf(previous.correct, previous.incorrect);

  return {
    currentStreak: currentStreak(days, today),
    longestStreak: longestStreak(days),
    daysStudiedLast30: Array.from(days).filter((d) => d >= start && d <= today)
      .length,
    sessionsLast30,
    minutesLast30: minutes,
    accuracyLast30,
    accuracyPrevious30,
    accuracyChange:
      accuracyLast30 !== null && accuracyPrevious30 !== null
        ? accuracyLast30 - accuracyPrevious30
        : null,
    hasAnyActivity: days.size > 0,
  };
}

// ---------------------------------------------------------- weekly data

/** How many days of each of the last `weeks` weeks had any activity. */
export function weeklyActiveDays(
  days: Set<string>,
  weeks: string[]
): number[] {
  return weeks.map((start) => {
    let count = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      if (days.has(addDays(start, offset))) count += 1;
    }
    return count;
  });
}

/**
 * Answers-correct percentage per week for a set of sessions; null for a week
 * with no answers, so a chart can leave a gap rather than draw a false zero.
 */
export function weeklyAccuracy(
  sessions: SessionPoint[],
  weeks: string[],
  timeZone: string
): Array<number | null> {
  const buckets = new Map<string, { correct: number; incorrect: number }>();
  for (const session of sessions) {
    const week = weekStart(dayKey(session.at, timeZone));
    const bucket = buckets.get(week) ?? { correct: 0, incorrect: 0 };
    bucket.correct += session.correct;
    bucket.incorrect += session.incorrect;
    buckets.set(week, bucket);
  }
  return weeks.map((week) => {
    const bucket = buckets.get(week);
    return bucket ? accuracyOf(bucket.correct, bucket.incorrect) : null;
  });
}

/** "12 Oct" style label for the start of a week. */
export function weekLabel(start: string): string {
  return new Date(parseDay(start)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

// --------------------------------------------------------- per subject

export interface Trend {
  recent: number;
  earlier: number;
  /** Points gained (positive) or lost (negative) from earlier to recent. */
  delta: number;
  direction: "up" | "down" | "steady";
}

/**
 * Whether accuracy is improving: the latest few sessions against everything
 * before them. Returns null until there is enough history on both sides for
 * the comparison to mean something.
 */
export function accuracyTrend(sessions: SessionPoint[]): Trend | null {
  const ordered = [...sessions].sort((a, b) => a.at.localeCompare(b.at));
  if (ordered.length <= RECENT_SESSIONS) return null;

  const recentSessions = ordered.slice(-RECENT_SESSIONS);
  const earlierSessions = ordered.slice(0, -RECENT_SESSIONS);
  const sum = (list: SessionPoint[]) =>
    list.reduce(
      (acc, s) => ({
        correct: acc.correct + s.correct,
        incorrect: acc.incorrect + s.incorrect,
      }),
      { correct: 0, incorrect: 0 }
    );
  const recent = sum(recentSessions);
  const earlier = sum(earlierSessions);

  if (
    recent.correct + recent.incorrect < TREND_MIN_ATTEMPTS ||
    earlier.correct + earlier.incorrect < TREND_MIN_ATTEMPTS
  ) {
    return null;
  }

  const recentPct = accuracyOf(recent.correct, recent.incorrect)!;
  const earlierPct = accuracyOf(earlier.correct, earlier.incorrect)!;
  const delta = recentPct - earlierPct;
  return {
    recent: recentPct,
    earlier: earlierPct,
    delta,
    direction:
      delta > STEADY_BAND_POINTS
        ? "up"
        : delta < -STEADY_BAND_POINTS
          ? "down"
          : "steady",
  };
}

export interface Mastery {
  mastered: number;
  /** Seen at least once but not yet reliably answered. */
  learning: number;
  /** Never answered yet. */
  fresh: number;
  total: number;
}

export function masteryOf(cardCount: number, stats: CardStat[]): Mastery {
  let mastered = 0;
  let learning = 0;
  for (const stat of stats) {
    const attempts = stat.correct + stat.incorrect;
    if (attempts === 0) continue;
    if (
      attempts >= MASTERED_MIN_ATTEMPTS &&
      stat.correct / attempts >= MASTERED_MIN_ACCURACY
    ) {
      mastered += 1;
    } else {
      learning += 1;
    }
  }
  const total = Math.max(cardCount, mastered + learning);
  return { mastered, learning, fresh: total - mastered - learning, total };
}

export interface ChecklistNext {
  id: string;
  title: string;
  /** Calendar day it was last practiced, or null if never. */
  lastDay: string | null;
  count: number;
}

export interface SubjectProgress {
  id: string;
  title: string;
  type: "FLASHCARDS" | "CHECKLIST";
  /** Calendar day of the latest activity, or null if there is none. */
  lastDay: string | null;
  daysSince: number | null;
  neglected: boolean;
  flashcards: {
    sessionsLast30: number;
    accuracy: number | null;
    trend: Trend | null;
    mastery: Mastery;
  } | null;
  checklist: {
    totalItems: number;
    practicedLast14: number;
    practicesLast30: number;
    next: ChecklistNext[];
  } | null;
}

export function subjectProgress(
  subject: SubjectInfo,
  sessions: SessionPoint[],
  practices: PracticePoint[],
  cardStats: CardStat[],
  now: string,
  timeZone: string
): SubjectProgress {
  const today = dayKey(now, timeZone);
  const start30 = addDays(today, -29);
  const start14 = addDays(today, -13);

  const mySessions = sessions.filter((s) => s.subjectId === subject.id);
  const myPractices = practices.filter((p) => p.subjectId === subject.id);

  const days = [
    ...mySessions.map((s) => dayKey(s.at, timeZone)),
    ...myPractices.map((p) => dayKey(p.at, timeZone)),
  ].sort();
  const lastDay = days.length > 0 ? days[days.length - 1] : null;
  const daysSince = lastDay === null ? null : daysBetween(lastDay, today);

  const base = {
    id: subject.id,
    title: subject.title,
    type: subject.type,
    lastDay,
    daysSince,
    neglected: daysSince === null || daysSince >= NEGLECTED_AFTER_DAYS,
  };

  if (subject.type === "FLASHCARDS") {
    const recent = mySessions.filter((s) => dayKey(s.at, timeZone) >= start30);
    const correct = recent.reduce((n, s) => n + s.correct, 0);
    const incorrect = recent.reduce((n, s) => n + s.incorrect, 0);
    return {
      ...base,
      flashcards: {
        sessionsLast30: recent.length,
        accuracy: accuracyOf(correct, incorrect),
        trend: accuracyTrend(mySessions),
        mastery: masteryOf(
          subject.cardCount,
          cardStats.filter((c) => c.subjectId === subject.id)
        ),
      },
      checklist: null,
    };
  }

  const lastByItem = new Map<string, string>();
  const countByItem = new Map<string, number>();
  for (const practice of myPractices) {
    const day = dayKey(practice.at, timeZone);
    const seen = lastByItem.get(practice.itemId);
    if (seen === undefined || day > seen) lastByItem.set(practice.itemId, day);
    countByItem.set(practice.itemId, (countByItem.get(practice.itemId) ?? 0) + 1);
  }

  const next: ChecklistNext[] = subject.items
    .map((item) => ({
      id: item.id,
      title: item.title,
      lastDay: lastByItem.get(item.id) ?? null,
      count: countByItem.get(item.id) ?? 0,
    }))
    // Never-practiced items first, then the longest-neglected.
    .sort((a, b) => {
      if (a.lastDay === b.lastDay) return a.title.localeCompare(b.title);
      if (a.lastDay === null) return -1;
      if (b.lastDay === null) return 1;
      return a.lastDay.localeCompare(b.lastDay);
    });

  return {
    ...base,
    flashcards: null,
    checklist: {
      totalItems: subject.items.length,
      practicedLast14: next.filter((i) => i.lastDay !== null && i.lastDay >= start14)
        .length,
      practicesLast30: myPractices.filter(
        (p) => dayKey(p.at, timeZone) >= start30
      ).length,
      next,
    },
  };
}

/**
 * Subjects ordered by who needs attention first: never started, then the
 * longest since last studied.
 */
export function byNeedForAttention(list: SubjectProgress[]): SubjectProgress[] {
  return [...list].sort((a, b) => {
    if (a.lastDay === b.lastDay) return a.title.localeCompare(b.title);
    if (a.lastDay === null) return -1;
    if (b.lastDay === null) return 1;
    return a.lastDay.localeCompare(b.lastDay);
  });
}

// ----------------------------------------------------- cards to review

export interface ReviewCard extends CardStat {
  attempts: number;
  /** Percentage of answers that were right. */
  accuracy: number;
}

/**
 * Cards still being missed at least as often as they are answered correctly.
 * A card that was missed early on but has since been mostly right is left
 * out, because it no longer needs the attention.
 */
export function cardsToReview(stats: CardStat[], limit = 10): ReviewCard[] {
  return stats
    .map((stat) => ({
      ...stat,
      attempts: stat.correct + stat.incorrect,
      accuracy: accuracyOf(stat.correct, stat.incorrect) ?? 0,
    }))
    .filter((card) => card.incorrect > 0 && card.incorrect >= card.correct)
    .sort(
      (a, b) =>
        b.incorrect - a.incorrect ||
        a.accuracy - b.accuracy ||
        a.prompt.localeCompare(b.prompt)
    )
    .slice(0, limit);
}

// ----------------------------------------------------------- wording

export function describeDaysAgo(days: number | null): string {
  if (days === null) return "Not started yet";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
