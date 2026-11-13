import { describe, expect, it } from "vitest";
import {
  accuracyTrend,
  activeDays,
  addDays,
  byNeedForAttention,
  cardsToReview,
  currentStreak,
  dayKey,
  daysBetween,
  describeDaysAgo,
  formatMinutes,
  lastWeekStarts,
  longestStreak,
  masteryOf,
  overview,
  subjectProgress,
  weekLabel,
  weekStart,
  weeklyAccuracy,
  weeklyActiveDays,
  type CardStat,
  type PracticePoint,
  type SessionPoint,
  type SubjectInfo,
  type SubjectProgress,
} from "@/lib/analytics";

const NY = "America/New_York";
const UTC = "UTC";
// Thursday 12 November 2026, midday in New York.
const NOW = "2026-11-12T17:00:00.000Z";

/** A session on a given day at noon UTC. */
function session(
  day: string,
  correct: number,
  incorrect: number,
  extra: Partial<SessionPoint> = {}
): SessionPoint {
  return {
    subjectId: "s1",
    at: `${day}T12:00:00.000Z`,
    correct,
    incorrect,
    durationMin: 5,
    ...extra,
  };
}

function practice(day: string, itemId = "i1", subjectId = "c1"): PracticePoint {
  return { subjectId, itemId, at: `${day}T12:00:00.000Z` };
}

describe("days", () => {
  it("puts a moment on the calendar day of the viewer's timezone", () => {
    // 03:28 UTC on the 13th is still the evening of the 12th in New York.
    const moment = "2026-11-13T03:28:51.000Z";

    expect(dayKey(moment, UTC)).toBe("2026-11-13");
    expect(dayKey(moment, NY)).toBe("2026-11-12");
    expect(dayKey(moment, "Asia/Tokyo")).toBe("2026-11-13");
    expect(dayKey(new Date(moment), NY)).toBe("2026-11-12");
  });

  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-11-12", 0)).toBe("2026-11-12");
  });

  it("counts days between two days", () => {
    expect(daysBetween("2026-11-12", "2026-11-12")).toBe(0);
    expect(daysBetween("2026-11-01", "2026-11-12")).toBe(11);
    expect(daysBetween("2026-12-25", "2027-01-01")).toBe(7);
  });

  it("starts weeks on Monday", () => {
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Monday
    expect(weekStart("2026-11-12")).toBe("2026-11-09"); // Thursday
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // next Monday
  });

  it("lists the last weeks oldest first, ending with this one", () => {
    expect(lastWeekStarts("2026-11-12", 3)).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
    ]);
    expect(lastWeekStarts("2026-11-12", 1)).toEqual(["2026-11-09"]);
  });

  it("labels a week by its first day", () => {
    expect(weekLabel("2026-11-09")).toBe("Nov 9");
  });
});

describe("streaks", () => {
  const days = (...list: string[]) => new Set(list);

  it("counts consecutive days ending today", () => {
    expect(
      currentStreak(days("2026-11-10", "2026-11-11", "2026-11-12"), "2026-11-12")
    ).toBe(3);
  });

  it("keeps a streak alive when today has not been studied yet", () => {
    expect(currentStreak(days("2026-11-10", "2026-11-11"), "2026-11-12")).toBe(2);
  });

  it("is broken by a missed day", () => {
    expect(currentStreak(days("2026-11-09", "2026-11-11"), "2026-11-12")).toBe(1);
    expect(currentStreak(days("2026-11-09", "2026-11-10"), "2026-11-12")).toBe(0);
  });

  it("is zero with no activity", () => {
    expect(currentStreak(days(), "2026-11-12")).toBe(0);
  });

  it("finds the longest run anywhere in the history", () => {
    expect(
      longestStreak(
        days("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-11-10", "2026-11-11")
      )
    ).toBe(4);
    expect(longestStreak(days("2026-11-10"))).toBe(1);
    expect(longestStreak(days())).toBe(0);
  });

  it("runs across month and year ends", () => {
    expect(longestStreak(days("2026-12-30", "2026-12-31", "2027-01-01"))).toBe(3);
  });

  it("counts a day once however much happened on it", () => {
    const set = activeDays(
      [session("2026-11-12", 1, 0), session("2026-11-12", 2, 0)],
      [practice("2026-11-12"), practice("2026-11-11")],
      UTC
    );

    expect(Array.from(set).sort()).toEqual(["2026-11-11", "2026-11-12"]);
  });

  it("uses the viewer's timezone to decide which day an evening session belongs to", () => {
    const lateEvening: SessionPoint = {
      subjectId: "s1",
      at: "2026-11-13T03:30:00.000Z",
      correct: 1,
      incorrect: 0,
      durationMin: 1,
    };

    expect(Array.from(activeDays([lateEvening], [], NY))).toEqual(["2026-11-12"]);
    expect(Array.from(activeDays([lateEvening], [], UTC))).toEqual(["2026-11-13"]);
  });
});

describe("overview", () => {
  it("reports nothing for an empty history", () => {
    expect(overview([], [], NOW, NY)).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      daysStudiedLast30: 0,
      sessionsLast30: 0,
      minutesLast30: 0,
      accuracyLast30: null,
      accuracyPrevious30: null,
      accuracyChange: null,
      hasAnyActivity: false,
    });
  });

  it("totals the last 30 days and compares accuracy with the 30 before", () => {
    const sessions = [
      session("2026-11-12", 8, 2, { durationMin: 10 }), // today
      session("2026-11-05", 6, 4, { durationMin: 20 }),
      session("2026-10-05", 5, 5), // 38 days ago: previous window
      session("2026-10-20", 5, 5), // 23 days ago: current window
    ];

    const result = overview(sessions, [], NOW, NY);

    expect(result.sessionsLast30).toBe(3);
    expect(result.minutesLast30).toBe(35);
    // (8 + 6 + 5) right out of (10 + 10 + 10) answers.
    expect(result.accuracyLast30).toBe(63);
    expect(result.accuracyPrevious30).toBe(50);
    expect(result.accuracyChange).toBe(13);
    expect(result.daysStudiedLast30).toBe(3);
  });

  it("includes exactly 30 days and not a 31st", () => {
    // Today is 12 Nov, so the 30-day window starts on 14 Oct.
    const inside = overview([session("2026-10-14", 1, 0)], [], NOW, NY);
    const outside = overview([session("2026-10-13", 1, 0)], [], NOW, NY);

    expect(inside.sessionsLast30).toBe(1);
    expect(outside.sessionsLast30).toBe(0);
    expect(outside.accuracyPrevious30).toBe(100);
  });

  it("has no change figure unless both windows have answers", () => {
    expect(overview([session("2026-11-12", 3, 1)], [], NOW, NY).accuracyChange).toBeNull();
    expect(overview([session("2026-10-01", 3, 1)], [], NOW, NY).accuracyChange).toBeNull();
  });

  it("counts checklist practice towards days studied and streaks, but not study time", () => {
    const result = overview([], [practice("2026-11-12"), practice("2026-11-11")], NOW, NY);

    expect(result.currentStreak).toBe(2);
    expect(result.daysStudiedLast30).toBe(2);
    expect(result.minutesLast30).toBe(0);
    expect(result.hasAnyActivity).toBe(true);
  });

  it("reports accuracy as null rather than 0% when nothing was answered", () => {
    expect(overview([session("2026-11-12", 0, 0)], [], NOW, NY).accuracyLast30).toBeNull();
  });

  it("includes the longest streak of the whole history", () => {
    const sessions = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-11-12"].map((d) =>
      session(d, 1, 0)
    );

    const result = overview(sessions, [], NOW, NY);

    expect(result.longestStreak).toBe(3);
    expect(result.currentStreak).toBe(1);
  });
});

describe("weekly series", () => {
  const weeks = lastWeekStarts("2026-11-12", 3); // 26 Oct, 2 Nov, 9 Nov

  it("counts active days within each week", () => {
    const set = new Set(["2026-11-09", "2026-11-10", "2026-11-15", "2026-10-27"]);

    expect(weeklyActiveDays(set, weeks)).toEqual([1, 0, 3]);
  });

  it("does not count days outside the listed weeks", () => {
    expect(weeklyActiveDays(new Set(["2026-10-25", "2026-11-16"]), weeks)).toEqual([0, 0, 0]);
  });

  it("gives weekly accuracy, leaving a gap for a week without answers", () => {
    const sessions = [
      session("2026-10-27", 1, 3),
      session("2026-11-10", 9, 1),
      session("2026-11-12", 1, 1),
    ];

    // Week of 9 Nov: 10 right out of 12.
    expect(weeklyAccuracy(sessions, weeks, UTC)).toEqual([25, null, 83]);
  });

  it("treats a week with only empty sessions as a gap", () => {
    expect(weeklyAccuracy([session("2026-11-10", 0, 0)], weeks, UTC)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("assigns sessions to weeks using the viewer's timezone", () => {
    // 01:00 UTC on Monday 9 Nov is still Sunday evening in New York, which is
    // the previous week.
    const earlyMonday: SessionPoint = {
      subjectId: "s1",
      at: "2026-11-09T01:00:00.000Z",
      correct: 1,
      incorrect: 0,
      durationMin: 1,
    };

    expect(weeklyAccuracy([earlyMonday], weeks, UTC)).toEqual([null, null, 100]);
    expect(weeklyAccuracy([earlyMonday], weeks, NY)).toEqual([null, 100, null]);
  });
});

describe("accuracyTrend", () => {
  const run = (counts: Array<[number, number]>) =>
    counts.map(([c, i], index) => session(addDays("2026-10-01", index), c, i));

  it("needs more than the recent sessions to compare against", () => {
    expect(accuracyTrend(run([[5, 5], [5, 5], [5, 5]]))).toBeNull();
    expect(accuracyTrend([])).toBeNull();
  });

  it("needs enough answers on both sides to mean anything", () => {
    // Earlier side has only 2 answers.
    expect(accuracyTrend(run([[1, 1], [5, 0], [5, 0], [5, 0]]))).toBeNull();
    // Recent side has only 3 answers.
    expect(accuracyTrend(run([[5, 5], [1, 0], [1, 0], [1, 0]]))).toBeNull();
  });

  it("reports improvement", () => {
    const trend = accuracyTrend(run([[5, 5], [5, 5], [9, 1], [9, 1], [9, 1]]));

    expect(trend).toEqual({ recent: 90, earlier: 50, delta: 40, direction: "up" });
  });

  it("reports decline", () => {
    const trend = accuracyTrend(run([[9, 1], [9, 1], [4, 6], [4, 6], [4, 6]]));

    expect(trend?.direction).toBe("down");
    expect(trend?.delta).toBe(-50);
  });

  it("calls a small change steady", () => {
    // 5 points either way is still steady; 6 is not.
    expect(accuracyTrend(run([[7, 3], [7, 3], [75, 25], [75, 25], [75, 25]]))?.direction).toBe(
      "steady"
    );
    expect(accuracyTrend(run([[7, 3], [7, 3], [76, 24], [76, 24], [76, 24]]))?.direction).toBe(
      "up"
    );
  });

  it("orders sessions by date itself", () => {
    const shuffled = run([[5, 5], [5, 5], [9, 1], [9, 1], [9, 1]]).reverse();

    expect(accuracyTrend(shuffled)?.direction).toBe("up");
  });
});

describe("masteryOf", () => {
  const stat = (correct: number, incorrect: number, cardId = "c"): CardStat => ({
    cardId,
    subjectId: "s1",
    prompt: "p",
    answer: "a",
    correct,
    incorrect,
  });

  it("calls a card mastered after 3 attempts at 80% or better", () => {
    expect(masteryOf(1, [stat(3, 0)])).toMatchObject({ mastered: 1, learning: 0 });
    expect(masteryOf(1, [stat(4, 1)])).toMatchObject({ mastered: 1 });
  });

  it("keeps a card in learning if it is too new or not accurate enough", () => {
    // Perfect, but only twice.
    expect(masteryOf(1, [stat(2, 0)])).toMatchObject({ mastered: 0, learning: 1 });
    // Three attempts, two right: 67%.
    expect(masteryOf(1, [stat(2, 1)])).toMatchObject({ mastered: 0, learning: 1 });
  });

  it("treats cards never answered as fresh", () => {
    expect(masteryOf(5, [stat(4, 0, "a"), stat(1, 1, "b")])).toEqual({
      mastered: 1,
      learning: 1,
      fresh: 3,
      total: 5,
    });
    expect(masteryOf(3, [stat(0, 0)])).toEqual({ mastered: 0, learning: 0, fresh: 3, total: 3 });
  });

  it("never reports a negative number of fresh cards", () => {
    // More statistics than cards, for example if cards were deleted.
    expect(masteryOf(1, [stat(5, 0, "a"), stat(5, 0, "b")])).toMatchObject({
      fresh: 0,
      total: 2,
    });
  });
});

describe("subjectProgress", () => {
  const flashcards: SubjectInfo = {
    id: "s1",
    title: "Chemistry",
    type: "FLASHCARDS",
    cardCount: 4,
    items: [],
  };
  const checklist: SubjectInfo = {
    id: "c1",
    title: "Piano",
    type: "CHECKLIST",
    cardCount: 0,
    items: [
      { id: "i1", title: "Scales" },
      { id: "i2", title: "Arpeggios" },
      { id: "i3", title: "Repertoire" },
    ],
  };

  it("summarises a flashcard subject", () => {
    const sessions = [
      session("2026-11-10", 4, 1),
      session("2026-11-11", 3, 2),
      session("2026-09-01", 1, 1), // old: excluded from the 30-day figures
      session("2026-11-12", 1, 0, { subjectId: "other" }),
    ];
    const stats: CardStat[] = [
      { cardId: "a", subjectId: "s1", prompt: "p", answer: "a", correct: 5, incorrect: 0 },
      { cardId: "b", subjectId: "s1", prompt: "p", answer: "a", correct: 1, incorrect: 2 },
    ];

    const result = subjectProgress(flashcards, sessions, [], stats, NOW, UTC);

    expect(result.flashcards).toMatchObject({
      sessionsLast30: 2,
      accuracy: 70,
      mastery: { mastered: 1, learning: 1, fresh: 2, total: 4 },
    });
    expect(result.checklist).toBeNull();
    expect(result.lastDay).toBe("2026-11-11");
    expect(result.daysSince).toBe(1);
    expect(result.neglected).toBe(false);
  });

  it("ignores card statistics from other subjects", () => {
    const stats: CardStat[] = [
      { cardId: "x", subjectId: "other", prompt: "p", answer: "a", correct: 9, incorrect: 0 },
    ];

    const result = subjectProgress(flashcards, [], [], stats, NOW, UTC);

    expect(result.flashcards?.mastery.mastered).toBe(0);
  });

  it("flags a subject as neglected after 14 days, or if it never started", () => {
    const stale = subjectProgress(flashcards, [session("2026-10-29", 1, 0)], [], [], NOW, UTC);
    const fresh = subjectProgress(flashcards, [session("2026-10-30", 1, 0)], [], [], NOW, UTC);
    const never = subjectProgress(flashcards, [], [], [], NOW, UTC);

    expect(stale.daysSince).toBe(14);
    expect(stale.neglected).toBe(true);
    expect(fresh.daysSince).toBe(13);
    expect(fresh.neglected).toBe(false);
    expect(never.lastDay).toBeNull();
    expect(never.daysSince).toBeNull();
    expect(never.neglected).toBe(true);
  });

  it("lists checklist items to practice next: never practiced first, then longest ago", () => {
    const practices = [
      practice("2026-11-01", "i1", "c1"),
      practice("2026-11-11", "i1", "c1"),
      practice("2026-11-05", "i2", "c1"),
      practice("2026-11-12", "i1", "other"), // another subject
    ];

    const result = subjectProgress(checklist, [], practices, [], NOW, UTC);

    expect(result.checklist?.next.map((i) => [i.title, i.lastDay, i.count])).toEqual([
      ["Repertoire", null, 0],
      ["Arpeggios", "2026-11-05", 1],
      ["Scales", "2026-11-11", 2],
    ]);
    expect(result.checklist).toMatchObject({
      totalItems: 3,
      practicedLast14: 2,
      practicesLast30: 3,
    });
    expect(result.flashcards).toBeNull();
    expect(result.lastDay).toBe("2026-11-11");
  });

  it("breaks ties between never-practiced items alphabetically", () => {
    const result = subjectProgress(checklist, [], [], [], NOW, UTC);

    expect(result.checklist?.next.map((i) => i.title)).toEqual([
      "Arpeggios",
      "Repertoire",
      "Scales",
    ]);
  });

  it("only counts an item as practiced recently within 14 days", () => {
    const result = subjectProgress(
      checklist,
      [],
      [practice("2026-10-30", "i1", "c1"), practice("2026-10-29", "i2", "c1")],
      [],
      NOW,
      UTC
    );

    expect(result.checklist?.practicedLast14).toBe(1);
  });
});

describe("byNeedForAttention", () => {
  const entry = (title: string, lastDay: string | null) =>
    ({ id: title, title, type: "FLASHCARDS", lastDay }) as unknown as SubjectProgress;

  it("puts never-started subjects first, then the longest since studied", () => {
    const sorted = byNeedForAttention([
      entry("Recent", "2026-11-12"),
      entry("Old", "2026-09-01"),
      entry("Never B", null),
      entry("Never A", null),
    ]);

    expect(sorted.map((s) => s.title)).toEqual(["Never A", "Never B", "Old", "Recent"]);
  });

  it("does not change the list it is given", () => {
    const list = [entry("B", "2026-11-12"), entry("A", "2026-09-01")];

    byNeedForAttention(list);

    expect(list.map((s) => s.title)).toEqual(["B", "A"]);
  });
});

describe("cardsToReview", () => {
  const stat = (prompt: string, correct: number, incorrect: number): CardStat => ({
    cardId: prompt,
    subjectId: "s1",
    prompt,
    answer: "a",
    correct,
    incorrect,
  });

  it("includes cards missed at least as often as answered correctly", () => {
    const cards = cardsToReview([stat("even", 2, 2), stat("worse", 1, 4)]);

    expect(cards.map((c) => c.prompt)).toEqual(["worse", "even"]);
    expect(cards[0]).toMatchObject({ attempts: 5, accuracy: 20 });
  });

  it("leaves out a card that was missed early but has improved since", () => {
    const cards = cardsToReview([stat("improved", 20, 5), stat("struggling", 1, 3)]);

    expect(cards.map((c) => c.prompt)).toEqual(["struggling"]);
  });

  it("leaves out cards never missed and cards never answered", () => {
    expect(cardsToReview([stat("perfect", 5, 0), stat("new", 0, 0)])).toEqual([]);
  });

  it("puts the most-missed first, then the lowest accuracy, then alphabetical", () => {
    const cards = cardsToReview([
      stat("b", 3, 3), // 6 attempts, 3 missed
      stat("a", 3, 3),
      stat("c", 0, 3), // 3 missed but 0% accurate
      stat("d", 0, 5), // most missed
      stat("e", 1, 3), // 3 missed, 25%
    ]);

    expect(cards.map((c) => c.prompt)).toEqual(["d", "c", "e", "a", "b"]);
  });

  it("limits the list", () => {
    const many = Array.from({ length: 15 }, (_, i) => stat(`card ${i}`, 0, i + 1));

    expect(cardsToReview(many)).toHaveLength(10);
    expect(cardsToReview(many, 3)).toHaveLength(3);
    expect(cardsToReview(many, 3)[0].prompt).toBe("card 14");
  });
});

describe("wording", () => {
  it("describes how long ago something was", () => {
    expect(describeDaysAgo(null)).toBe("Not started yet");
    expect(describeDaysAgo(0)).toBe("Today");
    expect(describeDaysAgo(1)).toBe("Yesterday");
    expect(describeDaysAgo(9)).toBe("9 days ago");
  });

  it("formats study time", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(135)).toBe("2 h 15 min");
  });
});
