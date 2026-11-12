import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubjectStudy } from "@/components/subjects/subject-study";
import type { StudyCard } from "@/lib/study-session";
import { fetchCall, jsonResponse, mockFetch, router } from "../helpers/browser";

const makeCards = (count: number): StudyCard[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `card-${index + 1}`,
    prompt: `Question ${index + 1}`,
    answer: `Answer ${index + 1}`,
  }));

function renderStudy(
  cards: StudyCard[],
  props: Partial<React.ComponentProps<typeof SubjectStudy>> = {}
) {
  return render(
    <SubjectStudy subjectId="subject-1" cards={cards} studyGoal={0} {...props} />
  );
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const heading = () => screen.getByRole("heading", { level: 2 });

beforeEach(() => {
  // With every roll at 0 the weighted draw always takes the first remaining
  // card, so cards come up in the order they were given.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("SubjectStudy with no cards", () => {
  it("tells an editor to add cards and disables marking", () => {
    renderStudy([], { canEditCards: true });

    expect(heading()).toHaveTextContent("No cards available");
    expect(
      screen.getByText("No cards yet. Use the card manager below to add your first one.")
    ).toBeInTheDocument();
    expect(button("Mark correct")).toBeDisabled();
    expect(button("Mark incorrect")).toBeDisabled();
  });

  it("tells a viewer to ask the owner", () => {
    renderStudy([]);

    expect(screen.getByText("No cards yet. Ask the owner to add some.")).toBeInTheDocument();
  });
});

describe("SubjectStudy run", () => {
  it("starts on the first card with zeroed counters", () => {
    renderStudy(makeCards(3));

    expect(heading()).toHaveTextContent("Card 1 of 3");
    expect(screen.getByText("Question 1")).toBeInTheDocument();
    expect(screen.getByText("Answer 1")).toBeInTheDocument();
    expect(screen.getByText("0 correct")).toBeInTheDocument();
    expect(screen.getByText("0 incorrect")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("Practicing 3 of 3 cards this run.")).toBeInTheDocument();
  });

  it("moves to the next card and updates counters after each answer", async () => {
    const user = userEvent.setup();
    renderStudy(makeCards(3));

    await user.click(button("Mark correct"));

    expect(heading()).toHaveTextContent("Card 2 of 3");
    expect(screen.getByText("Question 2")).toBeInTheDocument();
    expect(screen.queryByText("Question 1")).not.toBeInTheDocument();
    expect(screen.getByText("1 correct")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();

    await user.click(button("Mark incorrect"));

    expect(heading()).toHaveTextContent("Card 3 of 3");
    expect(screen.getByText("1 incorrect")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("shows a summary when the last card is answered", async () => {
    const user = userEvent.setup();
    renderStudy(makeCards(2));

    await user.click(button("Mark correct"));
    await user.click(button("Mark incorrect"));

    expect(heading()).toHaveTextContent("Session complete");
    expect(screen.getByText("Great work!")).toBeInTheDocument();
    expect(
      screen.getByText(/You completed 2 cards this run \(1 correct, 1 incorrect\)/)
    ).toBeInTheDocument();
    expect(button("Mark correct")).toBeDisabled();
    expect(button("Mark incorrect")).toBeDisabled();
    expect(button("Save session")).toBeEnabled();
    expect(button("Start new run")).toBeEnabled();
  });

  it("uses the singular for a one-card run", async () => {
    const user = userEvent.setup();
    renderStudy(makeCards(1));

    await user.click(button("Mark correct"));

    expect(screen.getByText(/You completed 1 card this run/)).toBeInTheDocument();
  });

  it("shows progress towards the study goal when one is set", async () => {
    const user = userEvent.setup();
    renderStudy(makeCards(1), { studyGoal: 20 });

    await user.click(button("Mark correct"));

    expect(screen.getByText("Study goal: 20 → progress 1/20")).toBeInTheDocument();
  });

  it("does not mention a study goal of zero", async () => {
    const user = userEvent.setup();
    renderStudy(makeCards(1));

    await user.click(button("Mark correct"));

    expect(screen.queryByText(/Study goal/)).not.toBeInTheDocument();
  });

  it("starts a fresh run with counters reset", async () => {
    const user = userEvent.setup();
    renderStudy(makeCards(2));
    await user.click(button("Mark correct"));
    await user.click(button("Mark correct"));

    await user.click(button("Start new run"));

    expect(heading()).toHaveTextContent("Card 1 of 2");
    expect(screen.getByText("0 correct")).toBeInTheDocument();
    expect(screen.queryByText("Great work!")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save session" })).not.toBeInTheDocument();
  });
});

describe("SubjectStudy saving", () => {
  it("posts the totals and per-card tallies, then confirms", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({ id: "session-1" }, 201));
    renderStudy(makeCards(3));

    await user.click(button("Mark correct"));
    await user.click(button("Mark incorrect"));
    await user.click(button("Mark correct"));
    await user.click(button("Save session"));

    expect(await screen.findByText(/Session saved! Start a new run/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchCall(fetchMock);
    expect(call.url).toBe("/api/subjects/subject-1/sessions");
    expect(call.method).toBe("POST");
    expect(call.body).toEqual({
      correct: 2,
      incorrect: 1,
      durationMin: 1,
      cardCount: 3,
      cards: [
        { cardId: "card-1", correct: 1, incorrect: 0 },
        { cardId: "card-2", correct: 0, incorrect: 1 },
        { cardId: "card-3", correct: 1, incorrect: 0 },
      ],
    });
    expect(button("Session saved")).toBeDisabled();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("rounds the elapsed time to minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2025-01-01T10:00:00Z"));
      const user = userEvent.setup();
      const fetchMock = mockFetch(jsonResponse({}, 201));
      renderStudy(makeCards(1));

      vi.setSystemTime(new Date("2025-01-01T10:07:20Z"));
      await user.click(button("Mark correct"));
      await user.click(button("Save session"));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchCall(fetchMock).body.durationMin).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the server's error and lets the user retry", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(
      jsonResponse({ error: "Mismatched card totals" }, 400),
      jsonResponse({}, 201)
    );
    renderStudy(makeCards(1));
    await user.click(button("Mark correct"));

    await user.click(button("Save session"));

    expect(await screen.findByText("Mismatched card totals")).toBeInTheDocument();
    expect(screen.queryByText(/Session saved!/)).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();

    await user.click(button("Save session"));

    expect(await screen.findByText(/Session saved!/)).toBeInTheDocument();
    expect(screen.queryByText("Mismatched card totals")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry must send the same results, not an emptied tally.
    expect(fetchCall(fetchMock, 1).body).toEqual(fetchCall(fetchMock, 0).body);
  });

  it("shows a message when the network fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));
    renderStudy(makeCards(1));
    await user.click(button("Mark correct"));

    await user.click(button("Save session"));

    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });
});

describe("SubjectStudy session size", () => {
  it("defaults to ten cards for a larger deck", () => {
    renderStudy(makeCards(12));

    expect(heading()).toHaveTextContent("Card 1 of 10");
    expect(screen.getByText("Practicing 10 of 12 cards this run.")).toBeInTheDocument();
  });

  it("offers presets plus All, and marks the current choice", () => {
    renderStudy(makeCards(3));

    expect(button("1")).toHaveAttribute("aria-pressed", "false");
    expect(button("2")).toHaveAttribute("aria-pressed", "false");
    expect(button("All (3)")).toHaveAttribute("aria-pressed", "true");
  });

  it("restarts the run at the chosen size", async () => {
    const user = userEvent.setup();
    renderStudy(makeCards(3));

    await user.click(button("2"));

    expect(heading()).toHaveTextContent("Card 1 of 2");
    expect(screen.getByText("Practicing 2 of 3 cards this run.")).toBeInTheDocument();
    expect(button("2")).toHaveAttribute("aria-pressed", "true");

    await user.click(button("Mark correct"));
    await user.click(button("Mark correct"));

    expect(heading()).toHaveTextContent("Session complete");
  });

  it("locks the size and repeat settings once a run is under way", async () => {
    const user = userEvent.setup();
    renderStudy(makeCards(3));

    await user.click(button("Mark correct"));

    expect(button("1")).toBeDisabled();
    expect(button("All (3)")).toBeDisabled();
    expect(button("Disabled")).toBeDisabled();
    expect(
      screen.getByText("Finish this run to adjust the session size.")
    ).toBeInTheDocument();
  });

  it("explains that a single card is always included", () => {
    renderStudy(makeCards(1));

    expect(
      screen.getByText("Only one card available. We'll include it every run.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^All/ })).not.toBeInTheDocument();
  });

  it("picks up cards added while the page is open", () => {
    const { rerender } = renderStudy(makeCards(2));
    expect(heading()).toHaveTextContent("Card 1 of 2");

    rerender(<SubjectStudy subjectId="subject-1" cards={makeCards(3)} studyGoal={0} />);

    expect(screen.getByText(/Practicing \d of 3 cards this run\./)).toBeInTheDocument();
  });
});

describe("SubjectStudy repeat missed cards", () => {
  it("is off by default, so a missed card is not shown again", async () => {
    const user = userEvent.setup();
    renderStudy(makeCards(2));

    await user.click(button("Mark incorrect"));
    await user.click(button("Mark incorrect"));

    expect(heading()).toHaveTextContent("Session complete");
  });

  it("keeps a missed card in the queue until it is answered correctly", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(jsonResponse({}, 201));
    renderStudy(makeCards(2));

    await user.click(button("Disabled"));
    expect(button("Enabled")).toHaveAttribute("aria-pressed", "true");

    await user.click(button("Mark incorrect")); // card 1 goes to the back
    expect(screen.getByText("Question 2")).toBeInTheDocument();
    await user.click(button("Mark correct")); // card 2 done
    expect(screen.getByText("Question 1")).toBeInTheDocument();
    expect(heading()).not.toHaveTextContent("Session complete");
    await user.click(button("Mark incorrect")); // card 1 missed again
    expect(screen.getByText("Question 1")).toBeInTheDocument();
    await user.click(button("Mark correct")); // card 1 finally done

    expect(heading()).toHaveTextContent("Session complete");

    await user.click(button("Save session"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchCall(fetchMock).body).toMatchObject({
      correct: 2,
      incorrect: 2,
      cardCount: 2,
      cards: [
        { cardId: "card-1", correct: 1, incorrect: 2 },
        { cardId: "card-2", correct: 1, incorrect: 0 },
      ],
    });
  });
});
