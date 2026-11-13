import { describe, expect, it } from "vitest";
import {
  groupSummary,
  memberLabel,
  memberStats,
  subjectComparisons,
  type GroupMember,
  type MemberPractice,
  type MemberSession,
} from "@/lib/group-analytics";

const NY = "America/New_York";
const UTC = "UTC";
// Thursday 12 November 2026, midday in New York.
const NOW = "2026-11-12T17:00:00.000Z";

const you: GroupMember = { id: "you", username: "you", name: "Yvonne", isYou: true };
const alice: GroupMember = { id: "alice", username: "alice", name: "Alice A", isYou: false };
const bob: GroupMember = { id: "bob", username: "bob", name: null, isYou: false };
const members = [you, alice, bob];

const session = (
  userId: string,
  day: string,
  correct: number,
  incorrect: number,
  extra: Partial<MemberSession> = {}
): MemberSession => ({
  userId,
  subjectId: "s1",
  at: `${day}T12:00:00.000Z`,
  correct,
  incorrect,
  durationMin: 10,
  ...extra,
});

const practice = (userId: string, day: string, extra: Partial<MemberPractice> = {}): MemberPractice => ({
  userId,
  subjectId: "c1",
  itemId: "i1",
  at: `${day}T12:00:00.000Z`,
  ...extra,
});

describe("memberStats", () => {
  it("works out each member's figures from their own activity only", () => {
    const sessions = [
      session("you", "2026-11-12", 8, 2),
      session("you", "2026-11-11", 6, 4),
      session("alice", "2026-11-12", 9, 1),
    ];

    const stats = memberStats(members, sessions, [], NOW, NY);
    const byId = Object.fromEntries(stats.map((s) => [s.member.id, s]));

    expect(byId.you).toMatchObject({
      currentStreak: 2,
      daysStudiedLast30: 2,
      sessionsLast30: 2,
      minutesLast30: 20,
      accuracyLast30: 70,
    });
    expect(byId.alice).toMatchObject({ daysStudiedLast30: 1, sessionsLast30: 1, accuracyLast30: 90 });
    expect(byId.bob).toMatchObject({
      currentStreak: 0,
      daysStudiedLast30: 0,
      accuracyLast30: null,
      lastDay: null,
      daysSince: null,
      activeThisWeek: false,
    });
  });

  it("counts checklist practice towards days studied and streaks", () => {
    const stats = memberStats(members, [], [practice("bob", "2026-11-12"), practice("bob", "2026-11-11")], NOW, NY);

    expect(stats.find((s) => s.member.id === "bob")).toMatchObject({
      currentStreak: 2,
      daysStudiedLast30: 2,
      minutesLast30: 0,
    });
  });

  it("orders members by days studied, then study time, then username", () => {
    const sessions = [
      session("alice", "2026-11-12", 1, 0),
      session("alice", "2026-11-11", 1, 0),
      session("you", "2026-11-12", 1, 0, { durationMin: 50 }),
      session("bob", "2026-11-12", 1, 0, { durationMin: 5 }),
    ];

    const order = memberStats(members, sessions, [], NOW, NY).map((s) => s.member.id);

    // alice studied 2 days; you and bob one each, but you studied longer.
    expect(order).toEqual(["alice", "you", "bob"]);
  });

  it("breaks a complete tie by username", () => {
    const order = memberStats(members, [], [], NOW, NY).map((s) => s.member.username);

    expect(order).toEqual(["alice", "bob", "you"]);
  });

  it("reports how long ago each member last studied", () => {
    const sessions = [session("alice", "2026-11-09", 1, 0)];

    const alice_ = memberStats(members, sessions, [], NOW, NY).find((s) => s.member.id === "alice")!;

    expect(alice_.lastDay).toBe("2026-11-09");
    expect(alice_.daysSince).toBe(3);
  });

  it("counts a member as active this week for activity in the last 7 days, today included", () => {
    const sessions = [
      session("you", "2026-11-06", 1, 0), // exactly 6 days ago: in
      session("alice", "2026-11-05", 1, 0), // 7 days ago: out
    ];

    const stats = memberStats(members, sessions, [], NOW, NY);

    expect(stats.find((s) => s.member.id === "you")?.activeThisWeek).toBe(true);
    expect(stats.find((s) => s.member.id === "alice")?.activeThisWeek).toBe(false);
  });

  it("uses the viewer's timezone to decide which day a session was on", () => {
    // 03:30 UTC on the 13th is still the evening of the 12th in New York.
    const late: MemberSession = {
      userId: "alice",
      subjectId: "s1",
      at: "2026-11-13T03:30:00.000Z",
      correct: 1,
      incorrect: 0,
      durationMin: 5,
    };

    const inNy = memberStats(members, [late], [], "2026-11-13T04:00:00.000Z", NY).find((s) => s.member.id === "alice");
    const inUtc = memberStats(members, [late], [], "2026-11-13T04:00:00.000Z", UTC).find((s) => s.member.id === "alice");

    expect(inNy?.lastDay).toBe("2026-11-12");
    expect(inUtc?.lastDay).toBe("2026-11-13");
  });

  it("ignores activity by people who are not in the member list", () => {
    const stats = memberStats([you], [session("stranger", "2026-11-12", 9, 1)], [], NOW, NY);

    expect(stats).toHaveLength(1);
    expect(stats[0].daysStudiedLast30).toBe(0);
  });

  it("handles a group with no members", () => {
    expect(memberStats([], [], [], NOW, NY)).toEqual([]);
  });
});

describe("groupSummary", () => {
  it("totals the group's last 30 days", () => {
    const sessions = [
      session("you", "2026-11-12", 8, 2),
      session("alice", "2026-11-11", 6, 4),
      session("alice", "2026-11-10", 5, 5),
      session("bob", "2026-09-01", 9, 1), // too old
    ];
    const stats = memberStats(members, sessions, [], NOW, NY);

    const summary = groupSummary(stats, sessions, NOW, NY);

    expect(summary).toMatchObject({
      memberCount: 3,
      activeThisWeek: 2,
      sessionsLast30: 3,
      minutesLast30: 30,
      // 19 right out of 30 answers.
      accuracyLast30: 63,
    });
    expect(summary.you?.member.id).toBe("you");
  });

  it("weights accuracy by answers, not by member", () => {
    // 100% from 1 answer and 50% from 99 answers is about 50%, not 75%.
    const sessions = [session("you", "2026-11-12", 1, 0), session("alice", "2026-11-12", 49, 50)];
    const stats = memberStats(members, sessions, [], NOW, NY);

    expect(groupSummary(stats, sessions, NOW, NY).accuracyLast30).toBe(50);
  });

  it("averages days studied across all members, including those who did not study", () => {
    const sessions = [
      session("you", "2026-11-12", 1, 0),
      session("you", "2026-11-11", 1, 0),
      session("alice", "2026-11-12", 1, 0),
      session("alice", "2026-11-11", 1, 0),
      session("alice", "2026-11-10", 1, 0),
    ];
    const stats = memberStats(members, sessions, [], NOW, NY);

    // (2 + 3 + 0) / 3
    expect(groupSummary(stats, sessions, NOW, NY).averageDaysStudied).toBe(1.7);
  });

  it("has no accuracy and no 'you' when there is nothing to report", () => {
    const stats = memberStats([alice, bob], [], [], NOW, NY);

    const summary = groupSummary(stats, [], NOW, NY);

    expect(summary).toMatchObject({
      memberCount: 2,
      activeThisWeek: 0,
      accuracyLast30: null,
      averageDaysStudied: 0,
      you: null,
    });
  });

  it("copes with an empty group", () => {
    expect(groupSummary([], [], NOW, NY)).toMatchObject({ memberCount: 0, averageDaysStudied: 0, you: null });
  });
});

describe("subjectComparisons", () => {
  const subjects = [
    { id: "s1", title: "Katas", type: "FLASHCARDS" as const },
    { id: "c1", title: "Stances", type: "CHECKLIST" as const },
  ];

  it("compares each member's accuracy and sessions on a flashcard subject", () => {
    const sessions = [
      session("you", "2026-11-12", 9, 1),
      session("you", "2026-11-11", 7, 3),
      session("alice", "2026-11-12", 5, 5),
      session("alice", "2026-11-12", 5, 5, { subjectId: "other" }), // a different subject
    ];

    const [katas] = subjectComparisons(subjects, members, sessions, [], NOW, NY);

    expect(katas.rows.map((r) => [r.member.id, r.sessions, r.accuracy])).toEqual([
      ["you", 2, 80],
      ["alice", 1, 50],
      ["bob", 0, null],
    ]);
  });

  it("only counts the last 30 days", () => {
    const sessions = [session("you", "2026-10-13", 1, 0), session("you", "2026-10-14", 1, 1)];

    const [katas] = subjectComparisons(subjects, [you], sessions, [], NOW, NY);

    expect(katas.rows[0]).toMatchObject({ sessions: 1, accuracy: 50, lastDay: "2026-10-14" });
  });

  it("still reports when a member last did it even if that was long ago", () => {
    const sessions = [session("alice", "2026-08-01", 1, 0)];

    const [katas] = subjectComparisons(subjects, [alice], sessions, [], NOW, NY);

    expect(katas.rows[0]).toMatchObject({ sessions: 0, accuracy: null, lastDay: "2026-08-01" });
  });

  it("counts checklist practices per member and orders by them", () => {
    const practices = [
      practice("bob", "2026-11-12"),
      practice("bob", "2026-11-11"),
      practice("you", "2026-11-12"),
      practice("alice", "2026-11-12", { subjectId: "other" }),
    ];

    const [, stances] = subjectComparisons(subjects, members, [], practices, NOW, NY);

    expect(stances.rows.map((r) => [r.member.id, r.practices])).toEqual([
      ["bob", 2],
      ["you", 1],
      ["alice", 0],
    ]);
  });

  it("breaks ties by username", () => {
    const [katas] = subjectComparisons(subjects, members, [], [], NOW, NY);

    expect(katas.rows.map((r) => r.member.username)).toEqual(["alice", "bob", "you"]);
  });

  it("returns an entry for each subject, even with no activity", () => {
    const result = subjectComparisons(subjects, members, [], [], NOW, NY);

    expect(result.map((r) => r.title)).toEqual(["Katas", "Stances"]);
    expect(subjectComparisons([], members, [], [], NOW, NY)).toEqual([]);
  });
});

describe("memberLabel", () => {
  it("prefers the name and falls back to the username", () => {
    expect(memberLabel(alice)).toBe("Alice A");
    expect(memberLabel(bob)).toBe("bob");
    expect(memberLabel({ ...bob, name: "   " })).toBe("bob");
  });
});
