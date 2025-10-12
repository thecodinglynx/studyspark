"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [orderedCards, setOrderedCards] = useState<StudyCard[]>(() =>
    shuffleCards(cards)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date>(new Date());

  const cardsSignature = useMemo(
    () =>
      cards.map((card) => `${card.id}:${card.prompt}:${card.answer}`).join("|"),
    [cards]
  );

  useEffect(() => {
    setOrderedCards(shuffleCards(cards));
    setCurrentIndex(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setCompleted(false);
    setStartedAt(new Date());
  }, [cardsSignature, cards]);

  const currentCard = orderedCards[currentIndex];
  const totalCards = orderedCards.length;

  const progressPercent = useMemo(() => {
    if (totalCards === 0) return 0;
    return Math.round(((currentIndex + Number(completed)) / totalCards) * 100);
  }, [currentIndex, totalCards, completed]);

  function moveToNext() {
    if (currentIndex + 1 >= totalCards) {
      setCompleted(true);
    } else {
      setCurrentIndex((prev: number) => prev + 1);
    }
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
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to save session");
      }

      router.refresh();
      setCorrectCount(0);
      setIncorrectCount(0);
      setCurrentIndex(0);
      setCompleted(false);
      setStartedAt(new Date());
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
              : `Card ${currentIndex + 1} of ${totalCards}`}
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
            You finished this run with {correctCount} correct and{" "}
            {incorrectCount} incorrect. Save the session to update your stats.
          </p>
          <p className="mt-2 text-sm">
            Study goal: {studyGoal} → progress {correctCount}/{studyGoal || "∞"}
          </p>
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
          >
            Save session
          </Button>
        )}
        {completed && (
          <Button
            type="button"
            size="lg"
            variant="ghost"
            onClick={() => {
              setCompleted(false);
              setCorrectCount(0);
              setIncorrectCount(0);
              setCurrentIndex(0);
              setOrderedCards(shuffleCards(cards));
              setStartedAt(new Date());
            }}
          >
            Start new run
          </Button>
        )}
      </div>
    </div>
  );
}
