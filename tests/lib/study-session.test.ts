import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSession,
  calculateCardWeight,
  getSessionSizeOptions,
  selectWeightedCards,
  type StudyCard,
} from "@/lib/study-session";

function card(id: string, correct = 0, incorrect = 0): StudyCard {
  return {
    id,
    prompt: `prompt ${id}`,
    answer: `answer ${id}`,
    stats: { correctCount: correct, incorrectCount: incorrect, lastStudiedAt: null },
  };
}

const deck = (size: number) =>
  Array.from({ length: size }, (_, index) => card(`c${index}`));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("calculateCardWeight", () => {
  it("gives a never-studied card a neutral weight of 1", () => {
    expect(calculateCardWeight({ id: "a", prompt: "p", answer: "a" })).toBe(1);
    expect(calculateCardWeight(card("a", 0, 0))).toBe(1);
  });

  it("weights missed cards above mastered ones", () => {
    expect(calculateCardWeight(card("a", 0, 3))).toBe(4);
    expect(calculateCardWeight(card("a", 3, 0))).toBe(0.25);
    expect(calculateCardWeight(card("a", 1, 5))).toBe(3);
  });

  it("never drops below 0.1, so mastered cards still appear sometimes", () => {
    expect(calculateCardWeight(card("a", 500, 0))).toBe(0.1);
  });
});

describe("selectWeightedCards", () => {
  it("returns the requested number of distinct cards", () => {
    const picked = selectWeightedCards(deck(20), 7);
    expect(picked).toHaveLength(7);
    expect(new Set(picked.map((c) => c.id)).size).toBe(7);
  });

  it("returns the whole deck when asked for more cards than exist", () => {
    const picked = selectWeightedCards(deck(3), 10);
    expect(picked.map((c) => c.id).sort()).toEqual(["c0", "c1", "c2"]);
  });

  it("returns nothing for an empty deck or a zero count", () => {
    expect(selectWeightedCards([], 5)).toEqual([]);
    expect(selectWeightedCards(deck(5), 0)).toEqual([]);
  });

  it("does not modify the list it is given", () => {
    const cards = deck(5);
    const before = cards.map((c) => c.id);
    selectWeightedCards(cards, 3);
    expect(cards.map((c) => c.id)).toEqual(before);
  });

  it("uses the random roll to walk the cumulative weights", () => {
    // Weights: a=1, b=4, c=1 (total 6).
    const cards = [card("a"), card("b", 0, 3), card("c")];

    vi.spyOn(Math, "random").mockReturnValue(0); // roll 0 lands in a
    expect(selectWeightedCards(cards, 1)[0].id).toBe("a");

    vi.spyOn(Math, "random").mockReturnValue(0.5); // roll 3 lands in b
    expect(selectWeightedCards(cards, 1)[0].id).toBe("b");

    vi.spyOn(Math, "random").mockReturnValue(0.999); // roll ~6 lands in c
    expect(selectWeightedCards(cards, 1)[0].id).toBe("c");
  });

  it("draws frequently-missed cards more often than mastered ones", () => {
    const cards = [card("missed", 0, 9), card("mastered", 9, 0)];
    let missedFirst = 0;
    for (let run = 0; run < 500; run += 1) {
      if (selectWeightedCards(cards, 1)[0].id === "missed") missedFirst += 1;
    }
    // Expected share is 10 / 10.1 = 99%; 80% leaves a wide safety margin.
    expect(missedFirst).toBeGreaterThan(400);
  });
});

describe("buildSession", () => {
  it("returns an empty session for an empty deck", () => {
    expect(buildSession([], 10)).toEqual({ cards: [], size: 0 });
  });

  it("uses the requested size when the deck is large enough", () => {
    const session = buildSession(deck(12), 5);
    expect(session.size).toBe(5);
    expect(session.cards).toHaveLength(5);
  });

  it("caps the size at the deck size", () => {
    const session = buildSession(deck(4), 10);
    expect(session.size).toBe(4);
    expect(session.cards).toHaveLength(4);
  });

  it.each([undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    "treats a requested size of %s as the whole deck",
    (desired) => {
      const session = buildSession(deck(6), desired);
      expect(session.size).toBe(6);
      expect(session.cards).toHaveLength(6);
    }
  );

  it("rounds fractional sizes down", () => {
    expect(buildSession(deck(6), 3.9).size).toBe(3);
  });
});

describe("getSessionSizeOptions", () => {
  it("offers no presets when there is at most one card", () => {
    expect(getSessionSizeOptions(0)).toEqual([]);
    expect(getSessionSizeOptions(1)).toEqual([]);
  });

  it("lists every smaller size for decks of up to ten cards", () => {
    expect(getSessionSizeOptions(2)).toEqual([1]);
    expect(getSessionSizeOptions(5)).toEqual([1, 2, 3, 4]);
    expect(getSessionSizeOptions(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("offers 10%-50% steps for medium decks", () => {
    expect(getSessionSizeOptions(15)).toEqual([2, 3, 5, 6, 8]);
  });

  it("rounds to even numbers from twenty cards", () => {
    expect(getSessionSizeOptions(20)).toEqual([2, 4, 6, 8, 10]);
  });

  it("rounds to multiples of five from forty cards", () => {
    expect(getSessionSizeOptions(40)).toEqual([5, 10, 15, 20]);
    expect(getSessionSizeOptions(100)).toEqual([10, 20, 30, 40, 50]);
  });

  it("never offers a preset as large as the deck, and never repeats one", () => {
    for (let total = 2; total <= 250; total += 1) {
      const options = getSessionSizeOptions(total);
      expect(options.every((option) => option >= 1 && option < total)).toBe(true);
      expect(new Set(options).size).toBe(options.length);
      expect([...options].sort((a, b) => a - b)).toEqual(options);
    }
  });
});
