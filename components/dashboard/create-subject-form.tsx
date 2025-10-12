"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";

interface DraftCard {
  id: string;
  prompt: string;
  answer: string;
}

function createEmptyCard(): DraftCard {
  return {
    id: generateId(),
    prompt: "",
    answer: "",
  };
}

function generateId(): string {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
        12,
        16
      )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  return `card-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

export function CreateSubjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [studyGoal, setStudyGoal] = useState(10);
  const [cards, setCards] = useState<DraftCard[]>([
    createEmptyCard(),
    createEmptyCard(),
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const completion = useMemo(() => {
    const total = cards.length * 2 + 1;
    const filled =
      cards.filter(
        (card: DraftCard) => card.prompt.trim() && card.answer.trim()
      ).length *
        2 +
      (title.trim() ? 1 : 0);
    return Math.round((filled / total) * 100);
  }, [cards, title]);

  function updateCard(id: string, field: keyof DraftCard, value: string) {
    setCards((prev: DraftCard[]) =>
      prev.map((card: DraftCard) =>
        card.id === id ? { ...card, [field]: value } : card
      )
    );
  }

  function addCard() {
    setCards((prev: DraftCard[]) => [...prev, createEmptyCard()]);
  }

  function removeCard(id: string) {
    if (cards.length <= 1) return;
    setCards((prev: DraftCard[]) =>
      prev.filter((card: DraftCard) => card.id !== id)
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const payload = {
      title,
      description: description.trim() || undefined,
      studyGoal,
      cards: cards
        .filter((card: DraftCard) => card.prompt.trim() && card.answer.trim())
        .map((card: DraftCard) => ({
          prompt: card.prompt.trim(),
          answer: card.answer.trim(),
        })),
    };

    if (payload.cards.length === 0) {
      setLoading(false);
      setError("Add at least one card with a prompt and answer");
      return;
    }

    try {
      const response = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Unable to save subject");
      }

      setSuccess("Subject created! Redirecting…");
      setTitle("");
      setDescription("");
      setCards([createEmptyCard(), createEmptyCard()]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Input
        label="Subject title"
        placeholder="Organic chemistry essentials"
        value={title}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setTitle(event.target.value)
        }
        required
      />
      <TextArea
        label="Description"
        placeholder="Short summary, e.g. Exam 3 study cards"
        rows={3}
        value={description}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          setDescription(event.target.value)
        }
      />
      <label className="flex flex-col gap-2 text-sm text-slate-300">
        <span className="font-medium text-slate-200">Study goal</span>
        <input
          type="range"
          min={0}
          max={200}
          value={studyGoal}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setStudyGoal(Number(event.target.value))
          }
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800"
        />
        <span className="text-xs text-slate-400">
          {studyGoal} correct answers target
        </span>
      </label>
      <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
              Cards
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Fill in at least one card to get started.
            </p>
          </div>
          <span className="text-xs text-slate-400">{completion}% ready</span>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {cards.map((card) => (
            <div
              key={card.id}
              className="rounded-2xl border border-white/5 bg-slate-950/60 p-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Card</h4>
                {cards.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCard(card.id)}
                    className="text-xs text-rose-300 hover:text-rose-200"
                  >
                    Remove
                  </button>
                )}
              </div>
              <Input
                label="Prompt"
                placeholder="What is the first law of thermodynamics?"
                value={card.prompt}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateCard(card.id, "prompt", event.target.value)
                }
                className="mt-3"
                required
              />
              <TextArea
                label="Answer"
                placeholder="Energy cannot be created or destroyed..."
                value={card.answer}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  updateCard(card.id, "answer", event.target.value)
                }
                className="mt-3"
                rows={3}
                required
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={addCard}>
            Add another card
          </Button>
        </div>
      </div>
      {error && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {success}
        </p>
      )}
      <Button type="submit" loading={loading} size="lg">
        Save subject
      </Button>
    </form>
  );
}
