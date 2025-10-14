"use client";

import {
  ChangeEvent,
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
}

function shuffleCards(list: StudyCard[]): StudyCard[] {
  const array = [...list];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
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

  const shuffled = shuffleCards(list);
  return {
    cards: shuffled.slice(0, normalized),
    size: normalized,
  };
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
  const [orderedCards, setOrderedCards] = useState<StudyCard[]>(() =>
    cards.slice(0, initialSessionSize)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [sessionSaved, setSessionSaved] = useState(false);

  const cardsSignature = useMemo(
    () =>
      cards.map((card) => `${card.id}:${card.prompt}:${card.answer}`).join("|"),
    [cards]
  );
  const previousSignatureRef = useRef<string | null>(null);

  const resetForNewRun = useCallback(
    (desiredCount: number = sessionSize) => {
      const { cards: nextCards, size } = buildSession(cards, desiredCount);
      setOrderedCards(nextCards);
      setCurrentIndex(0);
      setCorrectCount(0);
      setIncorrectCount(0);
      setCompleted(false);
      setStartedAt(new Date());
      setSessionSaved(false);
      if (size !== sessionSize) {
        setSessionSize(size);
      }
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
    !completed && (correctCount > 0 || incorrectCount > 0 || currentIndex > 0);

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

  const currentCard = orderedCards[currentIndex];
  const totalCards = orderedCards.length;
  const cardsCompleted = correctCount + incorrectCount;

  const progressPercent = useMemo(() => {
    if (totalCards === 0) return 0;
    const completedCount = completed
      ? totalCards
      : Math.min(cardsCompleted, totalCards);
    return Math.round((completedCount / totalCards) * 100);
  }, [cardsCompleted, completed, totalCards]);

  function moveToNext() {
    if (currentIndex + 1 >= totalCards) {
      setCompleted(true);
    } else {
      setCurrentIndex((prev: number) => prev + 1);
    }
  }

  function handleSessionSizeChange(event: ChangeEvent<HTMLInputElement>) {
    if (cards.length === 0) {
      setSessionSize(0);
      return;
    }

    const rawValue = event.target.valueAsNumber;
    if (Number.isNaN(rawValue)) {
      return;
    }

    const normalized = Math.max(
      1,
      Math.min(Math.floor(rawValue), cards.length)
    );
    setSessionSize(normalized);
  }

  async function recordResult(isCorrect: boolean) {
    if (completed) return;
    if (isCorrect) {
      setCorrectCount((prev: number) => prev + 1);
    } else {
      setIncorrectCount((prev: number) => prev + 1);
    }
    moveToNext();
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
              : `Card ${Math.min(
                  currentIndex + 1,
                  totalCards
                )} of ${totalCards}`}
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
          <div className="flex flex-col gap-1 text-sm text-slate-300 sm:items-end">
            <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="font-medium text-slate-200">Cards this run</span>
              <input
                type="number"
                inputMode="numeric"
                min={cards.length === 0 ? 0 : 1}
                max={cards.length === 0 ? 0 : cards.length}
                step={1}
                value={cards.length === 0 ? 0 : sessionSize}
                onChange={handleSessionSizeChange}
                disabled={cards.length === 0 || hasActiveProgress}
                className="w-24 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <span className="text-xs text-slate-500">
              {cards.length === 0
                ? "Add cards to start practicing."
                : hasActiveProgress
                ? "Finish this run to adjust the session size."
                : `Up to ${cards.length} cards available.`}
            </span>
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
