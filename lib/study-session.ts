export interface StudyCard {
  id: string;
  prompt: string;
  answer: string;
  stats?: {
    correctCount: number;
    incorrectCount: number;
    lastStudiedAt: string | null;
  };
}

export const DEFAULT_SESSION_SIZE = 10;

/**
 * Cards that were missed more often than answered correctly get a higher
 * weight, so they are more likely to be drawn into a study run.
 */
export function calculateCardWeight(card: StudyCard): number {
  const correct = card.stats?.correctCount ?? 0;
  const incorrect = card.stats?.incorrectCount ?? 0;
  const baseWeight = (incorrect + 1) / (correct + 1);
  return Math.max(baseWeight, 0.1);
}

/** Draws `count` distinct cards at random, biased by `calculateCardWeight`. */
export function selectWeightedCards(
  list: StudyCard[],
  count: number
): StudyCard[] {
  const pool = list.map((card) => ({
    card,
    weight: calculateCardWeight(card),
  }));

  const selected: StudyCard[] = [];

  while (pool.length > 0 && selected.length < count) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
      selected.push(
        ...pool.splice(0, count - selected.length).map((item) => item.card)
      );
      break;
    }

    let roll = Math.random() * totalWeight;
    let chosenIndex = pool.length - 1;

    for (let index = 0; index < pool.length; index += 1) {
      roll -= pool[index].weight;
      if (roll <= 0) {
        chosenIndex = index;
        break;
      }
    }

    const [picked] = pool.splice(chosenIndex, 1);
    selected.push(picked.card);
  }

  return selected;
}

/**
 * Builds the card queue for a run. A missing, non-finite or non-positive
 * `desiredCount` means "all cards"; larger counts are capped at the deck size.
 */
export function buildSession(
  list: StudyCard[],
  desiredCount?: number
): { cards: StudyCard[]; size: number } {
  if (list.length === 0) {
    return { cards: [], size: 0 };
  }

  const normalizedBase =
    typeof desiredCount === "number" && Number.isFinite(desiredCount)
      ? Math.floor(desiredCount)
      : list.length;

  const normalized =
    normalizedBase <= 0 ? list.length : Math.min(normalizedBase, list.length);

  return {
    cards: selectWeightedCards(list, normalized),
    size: normalized,
  };
}

/**
 * Preset run sizes offered for a deck of `total` cards, excluding the
 * "All" option. Small decks list every size; larger decks offer rounded
 * 10%-50% steps.
 */
export function getSessionSizeOptions(total: number): number[] {
  if (total <= 1) {
    return [];
  }

  if (total <= 10) {
    return Array.from({ length: total - 1 }, (_, index) => index + 1);
  }

  const preferredRatios = [0.1, 0.2, 0.3, 0.4, 0.5];
  const baseStep = total >= 40 ? 5 : total >= 20 ? 2 : 1;

  const roundToStep = (value: number) => {
    if (baseStep <= 1) {
      return Math.max(1, Math.round(value));
    }
    return Math.max(baseStep, Math.round(value / baseStep) * baseStep);
  };

  const options = preferredRatios
    .map((ratio) => roundToStep(total * ratio))
    .filter((count) => count > 0 && count < total);

  if (options.length === 0) {
    return [Math.min(total - 1, Math.max(1, Math.round(total / 2)))];
  }

  return Array.from(new Set(options)).sort((a, b) => a - b);
}
