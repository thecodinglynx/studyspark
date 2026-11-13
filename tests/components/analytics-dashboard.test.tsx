import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnalyticsDashboard,
  type AnalyticsData,
} from "@/components/analytics/analytics-dashboard";

// Thursday 12 November 2026, midday in New York.
const NOW = "2026-11-12T17:00:00.000Z";

const originalTimeZone = process.env.TZ;
afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

function data(overrides: Partial<AnalyticsData> = {}): AnalyticsData {
  return {
    now: NOW,
    subjects: [],
    sessions: [],
    practices: [],
    cardStats: [],
    ...overrides,
  };
}

const chem = {
  id: "s1",
  title: "Chemistry",
  type: "FLASHCARDS" as const,
  cardCount: 4,
  items: [],
};
const piano = {
  id: "c1",
  title: "Piano",
  type: "CHECKLIST" as const,
  cardCount: 0,
  items: [
    { id: "i1", title: "Scales" },
    { id: "i2", title: "Arpeggios" },
  ],
};

const session = (day: string, correct: number, incorrect: number, subjectId = "s1") => ({
  subjectId,
  at: `${day}T12:00:00.000Z`,
  correct,
  incorrect,
  durationMin: 10,
});

const chartData = (container: HTMLElement, kind: string) => {
  const element = container.querySelector(`[data-chart="${kind}"]`);
  return element ? JSON.parse(element.getAttribute("data-json")!) : null;
};

describe("AnalyticsDashboard", () => {
  describe("with no activity", () => {
    it("tells the user how to get started and links to their subjects", () => {
      render(<AnalyticsDashboard data={data()} />);

      expect(screen.getByText("Nothing to show yet")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to your subjects" })).toHaveAttribute(
        "href",
        "/dashboard"
      );
      expect(screen.queryByLabelText("Overview")).not.toBeInTheDocument();
      expect(screen.queryByText("Accuracy over time")).not.toBeInTheDocument();
    });

    it("still lists the user's subjects as not started", () => {
      render(<AnalyticsDashboard data={data({ subjects: [chem, piano] })} />);

      expect(screen.getAllByText("Last practiced: Not started yet")).toHaveLength(2);
      expect(screen.queryByText(/Not practiced in/)).not.toBeInTheDocument();
    });

    it("says so when there are no subjects at all", () => {
      render(<AnalyticsDashboard data={data()} />);

      expect(screen.getByText("You have no subjects yet.")).toBeInTheDocument();
    });
  });

  describe("overview tiles", () => {
    const withActivity = data({
      subjects: [chem],
      sessions: [
        session("2026-11-12", 8, 2),
        session("2026-11-11", 6, 4),
        session("2026-11-10", 7, 3),
      ],
    });

    it("shows streak, days studied, study time and accuracy", () => {
      process.env.TZ = "America/New_York";
      render(<AnalyticsDashboard data={withActivity} />);

      const overview = within(screen.getByLabelText("Overview"));
      expect(overview.getByText("3 days")).toBeInTheDocument();
      expect(overview.getByText("Longest so far: 3 days")).toBeInTheDocument();
      expect(overview.getByText("30 min")).toBeInTheDocument();
      expect(overview.getByText("3 flashcard sessions in the last 30 days")).toBeInTheDocument();
      expect(overview.getByText("70%")).toBeInTheDocument();
    });

    it("explains how to start a streak when there is none", () => {
      process.env.TZ = "America/New_York";
      render(
        <AnalyticsDashboard
          data={data({ subjects: [chem], sessions: [session("2026-10-01", 1, 0)] })}
        />
      );

      expect(screen.getByText("Study today to start a new streak")).toBeInTheDocument();
    });

    it("shows an accuracy gain, a loss, and when there is nothing to compare", () => {
      process.env.TZ = "America/New_York";
      const gain = render(
        <AnalyticsDashboard
          data={data({
            subjects: [chem],
            sessions: [session("2026-11-11", 9, 1), session("2026-10-01", 5, 5)],
          })}
        />
      );
      expect(screen.getByText("▲ 40 points up on the 30 days before")).toBeInTheDocument();
      gain.unmount();

      const loss = render(
        <AnalyticsDashboard
          data={data({
            subjects: [chem],
            sessions: [session("2026-11-11", 5, 5), session("2026-10-01", 9, 1)],
          })}
        />
      );
      expect(screen.getByText("▼ 40 points down on the 30 days before")).toBeInTheDocument();
      loss.unmount();

      render(<AnalyticsDashboard data={withActivity} />);
      expect(screen.getByText("No earlier sessions to compare")).toBeInTheDocument();
    });

    it("uses the singular for one point and one day", () => {
      process.env.TZ = "America/New_York";
      render(
        <AnalyticsDashboard
          data={data({
            subjects: [chem],
            sessions: [session("2026-11-12", 51, 49), session("2026-10-01", 50, 50)],
          })}
        />
      );

      expect(screen.getByText("▲ 1 point up on the 30 days before")).toBeInTheDocument();
      expect(screen.getByText("1 day")).toBeInTheDocument();
    });
  });

  describe("the viewer's timezone", () => {
    // 03:30 UTC on 13 November is 10:30 pm on the 12th in New York.
    const lateSession = {
      subjectId: "s1",
      at: "2026-11-13T03:30:00.000Z",
      correct: 1,
      incorrect: 0,
      durationMin: 5,
    };
    const lateNow = "2026-11-13T04:00:00.000Z"; // 11 pm on the 12th in New York

    it("says a late-evening session was today for someone in New York", () => {
      process.env.TZ = "America/New_York";
      render(
        <AnalyticsDashboard data={data({ now: lateNow, subjects: [chem], sessions: [lateSession] })} />
      );

      expect(screen.getByText("Last practiced: Today")).toBeInTheDocument();
    });

    it("works out the same moment differently for someone in Tokyo", () => {
      process.env.TZ = "Asia/Tokyo";
      // Tokyo is already into the 13th at 1 pm, so the session happened today there too.
      render(
        <AnalyticsDashboard data={data({ now: "2026-11-13T04:00:00.000Z", subjects: [chem], sessions: [lateSession] })} />
      );
      expect(screen.getByText("Last practiced: Today")).toBeInTheDocument();
    });

    it("counts a session as yesterday when the viewer's day has moved on", () => {
      process.env.TZ = "America/New_York";
      render(
        <AnalyticsDashboard
          data={data({ now: "2026-11-13T12:00:00.000Z", subjects: [chem], sessions: [lateSession] })}
        />
      );

      expect(screen.getByText("Last practiced: Yesterday")).toBeInTheDocument();
    });
  });

  describe("where to focus next", () => {
    it("orders subjects by how long since they were practiced and flags neglect", () => {
      process.env.TZ = "America/New_York";
      render(
        <AnalyticsDashboard
          data={data({
            subjects: [chem, piano],
            sessions: [session("2026-11-12", 1, 0)],
            practices: [{ subjectId: "c1", itemId: "i1", at: "2026-10-20T12:00:00.000Z" }],
          })}
        />
      );

      const rows = screen.getAllByRole("listitem").filter((li) => li.querySelector("h3"));
      const titles = rows.map((row) => row.querySelector("h3")!.textContent);
      expect(titles.indexOf("Piano")).toBeLessThan(titles.indexOf("Chemistry"));
      expect(screen.getByText("Not practiced in 23 days")).toBeInTheDocument();
      expect(screen.getByText("Last practiced: 23 days ago")).toBeInTheDocument();
    });

    it("shows a mastery bar with an accessible summary", () => {
      process.env.TZ = "America/New_York";
      render(
        <AnalyticsDashboard
          data={data({
            subjects: [chem],
            sessions: [session("2026-11-12", 1, 0)],
            cardStats: [
              { cardId: "a", subjectId: "s1", prompt: "p", answer: "a", correct: 5, incorrect: 0 },
              { cardId: "b", subjectId: "s1", prompt: "p", answer: "a", correct: 1, incorrect: 2 },
            ],
          })}
        />
      );

      expect(
        screen.getByRole("img", {
          name: "1 mastered, 1 still learning, 2 not started, out of 4 cards",
        })
      ).toBeInTheDocument();
    });

    it("explains what mastered means", () => {
      render(<AnalyticsDashboard data={data({ subjects: [chem] })} />);

      expect(screen.getByText(/≥80% right over 3\+ tries/)).toBeInTheDocument();
    });

    it("describes an improving, slipping and steady trend, and when it is too early", () => {
      process.env.TZ = "America/New_York";
      const trendFor = (counts: Array<[number, number]>) =>
        render(
          <AnalyticsDashboard
            data={data({
              subjects: [chem],
              sessions: counts.map(([c, i], index) =>
                session(`2026-11-0${index + 1}`, c, i)
              ),
            })}
          />
        );

      let view = trendFor([[5, 5], [5, 5], [9, 1], [9, 1], [9, 1]]);
      expect(screen.getByText(/▲ Improving: 90% right lately, up from 50% before/)).toBeInTheDocument();
      view.unmount();

      view = trendFor([[9, 1], [9, 1], [4, 6], [4, 6], [4, 6]]);
      expect(screen.getByText(/▼ Slipping: 40% right lately, down from 90% before/)).toBeInTheDocument();
      view.unmount();

      view = trendFor([[7, 3], [7, 3], [7, 3], [7, 3], [7, 3]]);
      expect(screen.getByText(/Steady: about 70% right/)).toBeInTheDocument();
      view.unmount();

      trendFor([[7, 3], [7, 3]]);
      expect(screen.getByText("Trend appears after a few more sessions.")).toBeInTheDocument();
    });

    it("shows checklist coverage and a progress bar", () => {
      process.env.TZ = "America/New_York";
      render(
        <AnalyticsDashboard
          data={data({
            subjects: [piano],
            practices: [{ subjectId: "c1", itemId: "i1", at: "2026-11-10T12:00:00.000Z" }],
          })}
        />
      );

      expect(screen.getByText("1 of 2 items practiced in the last 14 days.")).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: "1 of 2 items practiced recently" })
      ).toBeInTheDocument();
    });

    it("says so for a checklist with no items", () => {
      render(
        <AnalyticsDashboard
          data={data({ subjects: [{ ...piano, items: [] }] })}
        />
      );

      expect(screen.getAllByText("No checklist items yet.").length).toBeGreaterThan(0);
    });
  });

  describe("charts", () => {
    it("draws one accuracy line per flashcard subject that has answers", () => {
      process.env.TZ = "America/New_York";
      const { container } = render(
        <AnalyticsDashboard
          data={data({
            subjects: [chem, { ...chem, id: "s2", title: "Unstudied" }, piano],
            sessions: [session("2026-11-12", 3, 1)],
          })}
        />
      );

      const line = chartData(container, "line");
      expect(line.labels).toHaveLength(12);
      expect(line.labels[11]).toBe("Nov 9");
      expect(line.datasets.map((d: { label: string }) => d.label)).toEqual(["Chemistry"]);
      expect(line.datasets[0].data[11]).toBe(75);
    });

    it("says what is missing when only checklists have been practiced", () => {
      process.env.TZ = "America/New_York";
      render(
        <AnalyticsDashboard
          data={data({
            subjects: [piano],
            practices: [{ subjectId: "c1", itemId: "i1", at: "2026-11-12T12:00:00.000Z" }],
          })}
        />
      );

      expect(screen.getByText("Flashcard sessions will be charted here.")).toBeInTheDocument();
    });

    it("charts the number of days studied each week", () => {
      process.env.TZ = "America/New_York";
      const { container } = render(
        <AnalyticsDashboard
          data={data({
            subjects: [chem, piano],
            sessions: [session("2026-11-12", 1, 0), session("2026-11-09", 1, 0)],
            practices: [{ subjectId: "c1", itemId: "i1", at: "2026-11-10T12:00:00.000Z" }],
          })}
        />
      );

      const bar = chartData(container, "bar");
      expect(bar.datasets).toHaveLength(1);
      expect(bar.datasets[0].label).toBe("Days studied");
      expect(bar.datasets[0].data).toHaveLength(12);
      // 9, 10 and 12 November are three different days in the current week.
      expect(bar.datasets[0].data[11]).toBe(3);
    });
  });

  describe("cards to review", () => {
    it("lists cards that are still missed, with how often they were right", () => {
      render(
        <AnalyticsDashboard
          data={data({
            subjects: [chem],
            sessions: [session("2026-11-12", 1, 0)],
            cardStats: [
              { cardId: "a", subjectId: "s1", prompt: "What is an alkane?", answer: "Saturated", correct: 1, incorrect: 4 },
              { cardId: "b", subjectId: "s1", prompt: "Easy one", answer: "Yes", correct: 9, incorrect: 1 },
            ],
          })}
        />
      );

      expect(screen.getByText("What is an alkane?")).toBeInTheDocument();
      expect(screen.getByText(/Right 1 of 5 \(20\s?%\)/)).toBeInTheDocument();
      expect(screen.queryByText("Easy one")).not.toBeInTheDocument();
    });

    it("is hidden when nothing needs review", () => {
      render(<AnalyticsDashboard data={data({ subjects: [chem], sessions: [session("2026-11-12", 1, 0)] })} />);

      expect(screen.queryByText("Cards to review")).not.toBeInTheDocument();
    });
  });

  describe("checklist items to practice next", () => {
    it("shows never-practiced items first with a plain label", () => {
      process.env.TZ = "America/New_York";
      render(
        <AnalyticsDashboard
          data={data({
            subjects: [piano],
            practices: [{ subjectId: "c1", itemId: "i1", at: "2026-11-10T12:00:00.000Z" }],
          })}
        />
      );

      const section = screen.getByText("Checklist items to practice next").closest("div")!;
      const items = within(section).getAllByRole("listitem").map((li) => li.textContent);
      expect(items).toEqual(["ArpeggiosNever practiced", "Scales2 days ago"]);
    });
  });
});
