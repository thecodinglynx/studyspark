import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  GroupAnalytics,
  type GroupAnalyticsData,
} from "@/components/analytics/group-analytics";

// Thursday 12 November 2026, midday in New York.
const NOW = "2026-11-12T17:00:00.000Z";
const NY = "America/New_York";

afterEach(() => undefined);

const members = [
  { id: "you", username: "you", name: "Yvonne", isYou: true },
  { id: "alice", username: "alice", name: "Alice A", isYou: false },
  { id: "bob", username: "bob", name: null, isYou: false },
];

const session = (userId: string, day: string, correct: number, incorrect: number, subjectId = "s1") => ({
  userId,
  subjectId,
  at: `${day}T12:00:00.000Z`,
  correct,
  incorrect,
  durationMin: 10,
});

function group(overrides: Partial<GroupAnalyticsData> = {}): GroupAnalyticsData {
  return {
    name: "Karate club",
    members,
    sessions: [],
    practices: [],
    sharedSubjects: [],
    ...overrides,
  };
}

const show = (data: GroupAnalyticsData) =>
  render(<GroupAnalytics group={data} now={NOW} timeZone={NY} />);

describe("GroupAnalytics", () => {
  it("names the group and promises only totals", () => {
    show(group({ sessions: [session("you", "2026-11-12", 1, 0)] }));

    expect(screen.getByRole("heading", { name: "Your group: Karate club" })).toBeInTheDocument();
    expect(screen.getByText(/never anyone's individual answers/)).toBeInTheDocument();
  });

  it("is an anchor target for links to #group", () => {
    const { container } = show(group());

    expect(container.querySelector("section#group")).not.toBeNull();
  });

  describe("overview", () => {
    const data = group({
      sessions: [
        session("you", "2026-11-12", 8, 2),
        session("you", "2026-11-11", 8, 2),
        session("alice", "2026-11-12", 6, 4),
      ],
    });

    it("shows how many are active, group study time and accuracy, and the viewer's own figures", () => {
      show(data);
      const overview = within(screen.getByRole("group", { name: "Group overview" }));

      expect(overview.getByText("2 of 3")).toBeInTheDocument();
      expect(overview.getByText("30 min")).toBeInTheDocument();
      expect(overview.getByText("3 flashcard sessions in the last 30 days")).toBeInTheDocument();
      expect(overview.getByText("73%")).toBeInTheDocument();
      expect(overview.getByText("You: 80% · last 30 days")).toBeInTheDocument();
      expect(overview.getByText("2")).toBeInTheDocument();
      expect(overview.getByText("Group average: 1 · last 30 days")).toBeInTheDocument();
    });

    it("uses the singular for one session", () => {
      show(group({ sessions: [session("you", "2026-11-12", 1, 0)] }));

      expect(screen.getByText("1 flashcard session in the last 30 days")).toBeInTheDocument();
    });
  });

  describe("comparison table", () => {
    it("lists each member, marks the viewer, and orders by days studied", () => {
      show(
        group({
          sessions: [
            session("alice", "2026-11-12", 9, 1),
            session("alice", "2026-11-11", 9, 1),
            session("you", "2026-11-12", 5, 5),
          ],
        })
      );

      const table = screen.getByRole("table", { name: "Study activity of each member of Karate club" });
      const rows = within(table).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(3);
      expect(within(rows[0]).getByText("Alice A")).toBeInTheDocument();
      expect(within(rows[1]).getByText("Yvonne")).toBeInTheDocument();
      expect(within(rows[1]).getByText("You")).toBeInTheDocument();
      // Someone with no name appears as their username.
      expect(within(rows[2]).getByText("bob")).toBeInTheDocument();
    });

    it("shows streak, days, time, accuracy and when each last studied", () => {
      show(
        group({
          sessions: [
            session("alice", "2026-11-12", 9, 1),
            session("alice", "2026-11-11", 8, 2),
            session("bob", "2026-11-09", 5, 5),
          ],
        })
      );

      const aliceRow = screen.getByRole("row", { name: /Alice A/ });
      const cells = within(aliceRow).getAllByRole("cell").map((c) => c.textContent);
      expect(cells).toEqual(["2 days", "2", "20 min", "85%", "Today"]);

      const bobRow = screen.getByRole("row", { name: /bob/ });
      expect(within(bobRow).getAllByRole("cell").map((c) => c.textContent)).toEqual([
        "0 days",
        "1",
        "10 min",
        "50%",
        "3 days ago",
      ]);
    });

    it("shows a dash for accuracy and 'No activity yet' for someone who has not studied", () => {
      show(group({ sessions: [session("you", "2026-11-12", 1, 0)] }));

      const bobRow = screen.getByRole("row", { name: /bob/ });
      expect(within(bobRow).getAllByRole("cell").map((c) => c.textContent)).toEqual([
        "0 days",
        "0",
        "0 min",
        "—",
        "No activity yet",
      ]);
    });

    it("uses the viewer's timezone for which day a session was", () => {
      process.env.TZ = NY;
      // 03:30 UTC on the 13th is the evening of the 12th in New York.
      render(
        <GroupAnalytics
          group={group({
            sessions: [{ ...session("alice", "2026-11-13", 1, 0), at: "2026-11-13T03:30:00.000Z" }],
          })}
          now="2026-11-13T04:00:00.000Z"
          timeZone={NY}
        />
      );

      const aliceRow = screen.getByRole("row", { name: /Alice A/ });
      expect(within(aliceRow).getByText("Today")).toBeInTheDocument();
    });
  });

  describe("quiet and small groups", () => {
    it("says so when nobody has studied recently, and shows no table", () => {
      show(group());

      expect(screen.getByText("Nobody in the group has studied in the last 30 days yet.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("says so when the viewer is the only member", () => {
      show(group({ members: [members[0]] }));

      expect(screen.getByText("You are the only member of this group so far.")).toBeInTheDocument();
    });
  });

  describe("shared subjects", () => {
    const katas = { id: "s1", title: "Katas", type: "FLASHCARDS" as const };
    const stances = { id: "c1", title: "Stances", type: "CHECKLIST" as const };

    it("compares members' sessions and accuracy on a shared flashcard subject", () => {
      show(
        group({
          sharedSubjects: [katas],
          sessions: [
            session("alice", "2026-11-12", 9, 1),
            session("you", "2026-11-11", 5, 5),
            session("you", "2026-11-10", 5, 5),
            // Study on some other subject is not part of this comparison.
            session("alice", "2026-11-12", 0, 10, "other"),
          ],
        })
      );

      const table = screen.getByRole("table", { name: "Each member's progress on Katas" });
      const rows = within(table).getAllByRole("row").slice(1);
      const text = rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
      // You: 2 sessions at 50%; alice: 1 at 90%; bob: none.
      expect(text).toEqual([
        ["2", "50%", "Yesterday"],
        ["1", "90%", "Today"],
        ["0", "—", "Never"],
      ]);
      expect(within(rows[0]).getByText("You")).toBeInTheDocument();
    });

    it("compares practices on a shared checklist", () => {
      show(
        group({
          sharedSubjects: [stances],
          practices: [
            { userId: "bob", subjectId: "c1", itemId: "", at: "2026-11-12T12:00:00.000Z" },
            { userId: "bob", subjectId: "c1", itemId: "", at: "2026-11-11T12:00:00.000Z" },
          ],
        })
      );

      const table = screen.getByRole("table", { name: "Each member's progress on Stances" });
      expect(within(table).getByRole("columnheader", { name: "Practices" })).toBeInTheDocument();
      const first = within(table).getAllByRole("row")[1];
      expect(within(first).getByText("bob")).toBeInTheDocument();
      expect(within(first).getAllByRole("cell")[0].textContent).toBe("2");
    });

    it("is not shown when nothing has been shared with the group", () => {
      show(group({ sessions: [session("you", "2026-11-12", 1, 0)] }));

      expect(screen.queryByText("Shared subjects")).not.toBeInTheDocument();
    });
  });
});
