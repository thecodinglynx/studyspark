"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { FlipCard } from "@/components/flip-card";
import { Button } from "@/components/ui/button";

interface StudyCard {
  id: string;
  prompt: string;
  answer: string;
  stats?: {
    correctCount: number;
    incorrectCount: number;
    lastStudiedAt: string | null;
  };
}

function buildSession(
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

  const weighted = selectWeightedCards(list, normalized);
  return {
    cards: weighted,
    size: normalized,
  };
}

function selectWeightedCards(list: StudyCard[], count: number): StudyCard[] {
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
    let chosenIndex = 0;

    for (let index = 0; index < pool.length; index += 1) {
      roll -= pool[index].weight;
      if (roll <= 0) {
        chosenIndex = index;
        break;
      }
      if (index === pool.length - 1) {
        chosenIndex = index;
      }
    }

    const [picked] = pool.splice(chosenIndex, 1);
    selected.push(picked.card);
  }

  return selected;
}

function calculateCardWeight(card: StudyCard): number {
  const correct = card.stats?.correctCount ?? 0;
  const incorrect = card.stats?.incorrectCount ?? 0;
  const baseWeight = (incorrect + 1) / (correct + 1);
  return Math.max(baseWeight, 0.1);
}

interface SubjectStudyProps {
  subjectId: string;
  cards: StudyCard[];
  studyGoal: number;
  canEditCards?: boolean;
}

export function SubjectStudy({
  subjectId,
  cards,
  studyGoal,
  canEditCards = false,
}: SubjectStudyProps) {
  const router = useRouter();
  const initialSessionSize =
    cards.length === 0 ? 0 : Math.min(10, cards.length);
  const [, startRefresh] = useTransition();
  const [sessionSize, setSessionSize] = useState<number>(initialSessionSize);
  const [sessionQueue, setSessionQueue] = useState<StudyCard[]>(
    () => buildSession(cards, initialSessionSize).cards
  );
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [sessionSaved, setSessionSaved] = useState(false);
  const [repeatIncorrect, setRepeatIncorrect] = useState(false);
  const [cardTallies, setCardTallies] = useState<
    Record<string, { correct: number; incorrect: number }>
  >({});

  const cardsSignature = useMemo(
    () =>
      cards
        .map((card) =>
          [
            card.id,
            card.prompt,
            card.answer,
            card.stats?.correctCount ?? 0,
            card.stats?.incorrectCount ?? 0,
          ].join(":")
        )
        .join("|"),
    [cards]
  );
  const previousSignatureRef = useRef<string | null>(null);

  const resetForNewRun = useCallback(
    (desiredCount: number = sessionSize) => {
      const { cards: nextCards, size } = buildSession(cards, desiredCount);
      setSessionQueue(nextCards);
      setSessionSize(size);
      setCorrectCount(0);
      setIncorrectCount(0);
      setCompleted(false);
      setStartedAt(new Date());
      setSessionSaved(false);
      setCardTallies({});
      return size;
    },
    [cards, sessionSize]
  );

  useEffect(() => {
    if (previousSignatureRef.current === cardsSignature) {
      return;
    }
    previousSignatureRef.current = cardsSignature;

    if (cards.length === 0) {
      if (sessionSize !== 0) {
        setSessionSize(0);
        return;
      }
      resetForNewRun(0);
      return;
    }

    const fallbackSize = Math.min(10, cards.length) || cards.length;
    const normalizedSize =
      sessionSize <= 0 ? fallbackSize : Math.min(sessionSize, cards.length);

    if (normalizedSize !== sessionSize) {
      setSessionSize(normalizedSize);
      return;
    }

    resetForNewRun(normalizedSize);
  }, [cardsSignature, sessionSize, cards.length, resetForNewRun]);

  const hasActiveProgress =
    !completed && (correctCount > 0 || incorrectCount > 0);

  useEffect(() => {
    if (completed) {
      return;
    }

    if (cards.length === 0) {
      resetForNewRun(0);
      return;
    }

    if (hasActiveProgress) {
      return;
    }

    const normalizedSize = Math.min(sessionSize, cards.length);

    if (normalizedSize <= 0) {
      const fallbackSize = Math.min(10, cards.length) || cards.length;
      if (sessionSize !== fallbackSize) {
        setSessionSize(fallbackSize);
      } else {
        resetForNewRun(fallbackSize);
      }
      return;
    }

    if (normalizedSize !== sessionSize) {
      setSessionSize(normalizedSize);
      return;
    }

    resetForNewRun(normalizedSize);
  }, [sessionSize, hasActiveProgress, cards.length, completed, resetForNewRun]);

  const sessionSizeOptions = useMemo(() => {
    const total = cards.length;
    if (total <= 1) {
      return [] as number[];
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
      const fallback = Math.min(total - 1, Math.max(1, Math.round(total / 2)));
      return [fallback];
    }

    const unique = Array.from(new Set(options)).sort((a, b) => a - b);
    return unique;
  }, [cards.length]);

  const handleSessionSizeSelect = useCallback(
    (nextSize: number) => {
      if (cards.length === 0 || hasActiveProgress) {
        return;
      }
      resetForNewRun(nextSize);
    },
    [cards.length, hasActiveProgress, resetForNewRun]
  );

  const currentCard = sessionQueue[0];
  const totalCards = sessionSize;
  const cardsRemaining = sessionQueue.length;
  const cardsCompleted = Math.max(0, totalCards - cardsRemaining);
  const currentCardNumber =
    cardsRemaining > 0
      ? Math.min(totalCards - cardsRemaining + 1, totalCards)
      : totalCards;

  const progressPercent = useMemo(() => {
    if (totalCards === 0) return 0;
    const completedCount = Math.min(cardsCompleted, totalCards);
    return Math.round((completedCount / totalCards) * 100);
  }, [cardsCompleted, totalCards]);

  async function recordResult(isCorrect: boolean) {
    if (completed) return;
    const cardId = currentCard?.id;
    if (!cardId) {
      return;
    }

    setCardTallies((previous) => {
      const existing = previous[cardId] ?? { correct: 0, incorrect: 0 };
      const next = {
        correct: existing.correct + (isCorrect ? 1 : 0),
        incorrect: existing.incorrect + (isCorrect ? 0 : 1),
      };
      return {
        ...previous,
        [cardId]: next,
      };
    });

    if (isCorrect) {
      setCorrectCount((prev: number) => prev + 1);
    } else {
      setIncorrectCount((prev: number) => prev + 1);
    }

    // Reorder queue: drop completed cards, optionally cycle missed ones to the back.
    setSessionQueue((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      const [first, ...rest] = previous;
      const nextQueue = isCorrect || !repeatIncorrect ? rest : [...rest, first];

      if (nextQueue.length === 0) {
        setCompleted(true);
      }

      return nextQueue;
    });
  }

  async function saveSession() {
    setSaving(true);
    setError(null);

    const durationMin = Math.max(
      1,
      Math.round((Date.now() - startedAt.getTime()) / 60000)
    );

    try {
      const response = await fetch(`/api/subjects/${subjectId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correct: correctCount,
          incorrect: incorrectCount,
          durationMin,
          cardCount: cardsCompleted,
          cards: Object.entries(cardTallies).map(([cardId, tallies]) => ({
            cardId,
            correct: tallies.correct,
            incorrect: tallies.incorrect,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to save session");
      }

      startRefresh(() => {
        router.refresh();
      });
      setSessionSaved(true);
      setCardTallies({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Study session
          </p>
          <h2 className="text-2xl font-semibold text-white">
            {completed
              ? "Session complete"
              : totalCards === 0
              ? "No cards available"
              : `Card ${currentCardNumber} of ${totalCards}`}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-slate-300 sm:gap-3">
          <span className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
            {correctCount} correct
          </span>
          <span className="flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1 text-rose-300">
            {incorrectCount} incorrect
          </span>
          <span className="flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-blue-300">
            {progressPercent}%
          </span>
        </div>
      </header>

      <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Session setup
            </p>
            <p className="text-sm text-slate-300">
              Practicing {totalCards} of {cards.length} cards this run.
            </p>
          </div>
          <div className="flex flex-col gap-4 text-sm text-slate-300 sm:items-end">
            <div className="flex flex-col gap-2 sm:items-end">
              <span className="font-medium text-slate-200">Cards this run</span>
              {cards.length > 1 && sessionSizeOptions.length > 0 && (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {sessionSizeOptions.map((option) => {
                    const isSelected = sessionSize === option;
                    return (
                      <Button
                        key={`session-size-${option}`}
                        type="button"
                        size="sm"
                        variant={isSelected ? "primary" : "secondary"}
                        aria-pressed={isSelected}
                        onClick={() => handleSessionSizeSelect(option)}
                        disabled={cards.length === 0 || hasActiveProgress}
                      >
                        {option}
                      </Button>
                    );
                  })}
                  <Button
                    key="session-size-all"
                    type="button"
                    size="sm"
                    variant={
                      sessionSize === cards.length ? "primary" : "secondary"
                    }
                    aria-pressed={sessionSize === cards.length}
                    onClick={() => handleSessionSizeSelect(cards.length)}
                    disabled={cards.length === 0 || hasActiveProgress}
                  >
                    All ({cards.length})
                  </Button>
                </div>
              )}
              {cards.length === 1 && (
                <span className="text-xs text-slate-500">
                  Only one card available. We&apos;ll include it every run.
                </span>
              )}
              {cards.length === 0 && (
                <span className="text-xs text-slate-500">
                  Add cards to start practicing.
                </span>
              )}
              {cards.length > 1 && (
                <span className="text-xs text-slate-500 sm:text-right">
                  {hasActiveProgress
                    ? "Finish this run to adjust the session size."
                    : "Choose a preset or pick All to study the whole subject."}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <span className="font-medium text-slate-200">
                Repeat missed cards
              </span>
              <Button
                type="button"
                size="sm"
                variant={repeatIncorrect ? "primary" : "secondary"}
                aria-pressed={repeatIncorrect}
                onClick={() => setRepeatIncorrect((prev) => !prev)}
                disabled={hasActiveProgress}
                className="px-4"
              >
                {repeatIncorrect ? "Enabled" : "Disabled"}
              </Button>
              <span className="text-xs text-slate-500 sm:text-right">
                {hasActiveProgress
                  ? "Finish this run to change this setting."
                  : "Keep incorrect cards in the queue until they are answered correctly."}
              </span>
            </div>
          </div>
        </div>
      </div>

      {totalCards === 0 && (
        <p className="text-sm text-slate-400">
          {canEditCards
            ? "No cards yet. Use the card manager below to add your first one."
            : "No cards yet. Ask the owner to add some."}
        </p>
      )}

      {totalCards > 0 && !completed && currentCard && (
        <FlipCard
          key={currentCard.id}
          className="mt-4"
          front={<span>{currentCard.prompt}</span>}
          back={<span>{currentCard.answer}</span>}
        />
      )}

      {completed && (
        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-emerald-200">
          <h3 className="text-lg font-semibold">Great work!</h3>
          <p className="mt-2 text-sm">
            You completed {cardsCompleted}{" "}
            {cardsCompleted === 1 ? "card" : "cards"} this run ({correctCount}{" "}
            correct, {incorrectCount} incorrect). Save the session to update
            your stats.
          </p>
          {studyGoal > 0 && (
            <p className="mt-2 text-sm">
              Study goal: {studyGoal} → progress {correctCount}/{studyGoal}
            </p>
          )}
          {sessionSaved && (
            <p className="mt-3 text-sm text-emerald-100">
              Session saved! Start a new run whenever you&apos;re ready.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Button
          type="button"
          size="lg"
          variant="secondary"
          onClick={() => recordResult(false)}
          disabled={completed || totalCards === 0}
        >
          Mark incorrect
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={() => recordResult(true)}
          disabled={completed || totalCards === 0}
        >
          Mark correct
        </Button>
        {completed && (
          <Button
            type="button"
            size="lg"
            loading={saving}
            onClick={saveSession}
            disabled={sessionSaved}
          >
            {sessionSaved ? "Session saved" : "Save session"}
          </Button>
        )}
        {completed && (
          <Button
            type="button"
            size="lg"
            variant="ghost"
            onClick={() => {
              resetForNewRun();
            }}
            disabled={saving}
          >
            Start new run
          </Button>
        )}
      </div>
    </div>
  );
}
