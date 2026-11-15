import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  AnalyticsDashboard,
  type AnalyticsData,
} from "@/components/analytics/analytics-dashboard";

const NOW = "2026-11-12T17:00:00.000Z";

const base: AnalyticsData = {
  now: NOW,
  subjects: [
    { id: "s1", title: "Chemistry", type: "FLASHCARDS", cardCount: 4, items: [] },
  ],
  sessions: [
    { subjectId: "s1", at: "2026-11-11T12:00:00.000Z", correct: 3, incorrect: 1, durationMin: 5 },
  ],
  practices: [],
  cardStats: [],
};

const group: NonNullable<AnalyticsData["group"]> = {
  name: "Karate club",
  members: [
    { id: "you", username: "you", name: "Yvonne", isYou: true },
    { id: "alice", username: "alice", name: "Alice A", isYou: false },
  ],
  sessions: [],
  practices: [],
  sharedSubjects: [],
};

const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });

describe("analytics tabs", () => {
  it("shows no tabs to someone who is not in a group", () => {
    render(<AnalyticsDashboard data={base} />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText("Where to focus next")).toBeVisible();
  });

  it("offers You and Group tabs, starting on your own analytics", () => {
    render(<AnalyticsDashboard data={{ ...base, group }} />);

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(tab("You")).toHaveAttribute("aria-selected", "true");
    expect(tab("Group")).toHaveAttribute("aria-selected", "false");
    expect(tab("Group")).toHaveTextContent("Karate club");
    expect(screen.getByText("Where to focus next")).toBeVisible();
    expect(screen.queryByText("Your group: Karate club")).not.toBeVisible();
  });

  it("switches to the group analytics and back", async () => {
    const user = userEvent.setup();
    render(<AnalyticsDashboard data={{ ...base, group }} />);

    await user.click(tab("Group"));

    expect(tab("Group")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Your group: Karate club")).toBeVisible();
    expect(screen.getByText("Where to focus next")).not.toBeVisible();

    await user.click(tab("You"));

    expect(screen.getByText("Where to focus next")).toBeVisible();
    expect(screen.getByText("Your group: Karate club")).not.toBeVisible();
  });

  it("connects each tab to its panel", () => {
    render(<AnalyticsDashboard data={{ ...base, group }} />);

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tab("You").id);
    expect(tab("You")).toHaveAttribute("aria-controls", panel.id);
  });

  it("moves between tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<AnalyticsDashboard data={{ ...base, group }} />);

    tab("You").focus();
    await user.keyboard("{ArrowRight}");

    expect(tab("Group")).toHaveAttribute("aria-selected", "true");
    expect(tab("Group")).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(tab("You")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    expect(tab("Group")).toHaveAttribute("aria-selected", "true");
  });
});
