import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { SessionSummary } from "@/components/subjects/session-summary";
import { LocalTime } from "@/components/ui/local-time";

// 3:28 AM UTC on 13 November is 10:28 PM the evening before in New York.
const MOMENT = "2026-11-13T03:28:51.000Z";

const originalTimeZone = process.env.TZ;
afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

describe("LocalTime", () => {
  it("shows the time in the viewer's own timezone", () => {
    process.env.TZ = "America/New_York";

    render(<LocalTime value={MOMENT} />);

    expect(screen.getByText("Nov 12, 2026, 10:28 PM")).toBeInTheDocument();
  });

  it("follows a different timezone too", () => {
    process.env.TZ = "Asia/Tokyo";

    render(<LocalTime value={MOMENT} />);

    expect(screen.getByText("Nov 13, 2026, 12:28 PM")).toBeInTheDocument();
  });

  it("can show just the date", () => {
    process.env.TZ = "America/New_York";

    render(<LocalTime value={MOMENT} variant="date" />);

    expect(screen.getByText("Nov 12, 2026")).toBeInTheDocument();
  });

  it("builds the page on the server in UTC, which the browser then replaces", () => {
    process.env.TZ = "America/New_York";

    // The server snapshot is what is sent in the first HTML.
    const html = renderToString(<LocalTime value={MOMENT} />);

    expect(html).toContain("Nov 13, 2026, 3:28 AM");
  });

  it("is a machine-readable <time> element that never wraps", () => {
    render(<LocalTime value={MOMENT} />);

    const element = screen.getByText(/2026/);
    expect(element.tagName).toBe("TIME");
    expect(element).toHaveAttribute("dateTime", MOMENT);
    expect(element.className).toContain("whitespace-nowrap");
  });

  it("shows nothing rather than crashing for an invalid value", () => {
    const { container } = render(<LocalTime value="not a date" />);

    expect(container.querySelector("time")).toBeEmptyDOMElement();
  });
});

describe("SessionSummary", () => {
  const renderSummary = (overrides: Partial<React.ComponentProps<typeof SessionSummary>> = {}) =>
    render(
      <SessionSummary
        studiedAt={MOMENT}
        cardsUsed={4}
        totalCards={4}
        correct={4}
        incorrect={0}
        durationMin={1}
        {...overrides}
      />
    );

  it("labels every number so none of them needs explaining", () => {
    renderSummary();

    expect(screen.getByText("4 of 4 cards")).toBeInTheDocument();
    expect(screen.getByText("4 correct")).toBeInTheDocument();
    expect(screen.getByText("0 incorrect")).toBeInTheDocument();
    expect(screen.getByText("Studied for 1 min")).toBeInTheDocument();
  });

  it("keeps each detail on one line so wrapping only happens between them", () => {
    renderSummary({ durationMin: 25, correct: 9, incorrect: 3, cardsUsed: 12, totalCards: 30 });

    for (const text of ["12 of 30 cards", "9 correct", "3 incorrect", "Studied for 25 min"]) {
      expect(screen.getByText(text).className).toContain("whitespace-nowrap");
    }
  });

  it("puts the date on its own line above the details", () => {
    const { container } = renderSummary();

    const [dateLine, details] = Array.from(container.firstElementChild!.children);
    expect(dateLine.tagName).toBe("TIME");
    expect(details.textContent).toBe("4 of 4 cards4 correct0 incorrectStudied for 1 min");
  });
});
