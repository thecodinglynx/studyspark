"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";

type SubjectTypeOption = "FLASHCARDS" | "CHECKLIST";

interface DraftCard {
  id: string;
  prompt: string;
  answer: string;
}

interface DraftChecklistItem {
  id: string;
  title: string;
  description: string;
}

function createEmptyCard(): DraftCard {
  return {
    id: generateId(),
    prompt: "",
    answer: "",
  };
}

function createEmptyItem(): DraftChecklistItem {
  return {
    id: generateId(),
    title: "",
    description: "",
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
  const [subjectType, setSubjectType] =
    useState<SubjectTypeOption>("FLASHCARDS");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [studyGoal, setStudyGoal] = useState(10);
  const [cards, setCards] = useState<DraftCard[]>([
    createEmptyCard(),
    createEmptyCard(),
  ]);
  const [items, setItems] = useState<DraftChecklistItem[]>([
    createEmptyItem(),
    createEmptyItem(),
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const completion = useMemo(() => {
    if (subjectType === "FLASHCARDS") {
      const total = cards.length * 2 + 1;
      const filled =
        cards.filter(
          (card: DraftCard) => card.prompt.trim() && card.answer.trim()
        ).length *
          2 +
        (title.trim() ? 1 : 0);
      return Math.round((filled / Math.max(total, 1)) * 100);
    }

    const total = items.length + 1;
    const filled =
      items.filter((item) => item.title.trim()).length + (title.trim() ? 1 : 0);
    return Math.round((filled / Math.max(total, 1)) * 100);
  }, [cards, items, subjectType, title]);

  function updateCard(id: string, field: keyof DraftCard, value: string) {
    setCards((prev: DraftCard[]) =>
      prev.map((card: DraftCard) =>
        card.id === id ? { ...card, [field]: value } : card
      )
    );
  }

  function updateItem(
    id: string,
    field: keyof DraftChecklistItem,
    value: string
  ) {
    setItems((prev: DraftChecklistItem[]) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
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

  function addItem() {
    setItems((prev: DraftChecklistItem[]) => [...prev, createEmptyItem()]);
  }

  function removeItem(id: string) {
    if (items.length <= 1) return;
    setItems((prev: DraftChecklistItem[]) =>
      prev.filter((item: DraftChecklistItem) => item.id !== id)
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const basePayload = {
      title,
      description: description.trim() || undefined,
      studyGoal,
    } as const;

    let payload:
      | {
          type: "FLASHCARDS";
          title: string;
          description?: string;
          studyGoal: number;
          cards: { prompt: string; answer: string }[];
        }
      | {
          type: "CHECKLIST";
          title: string;
          description?: string;
          studyGoal: number;
          items: { title: string; description?: string }[];
        };

    if (subjectType === "FLASHCARDS") {
      const cardsPayload = {
        ...basePayload,
        type: "FLASHCARDS" as const,
        cards: cards
          .filter((card: DraftCard) => card.prompt.trim() && card.answer.trim())
          .map((card: DraftCard) => ({
            prompt: card.prompt.trim(),
            answer: card.answer.trim(),
          })),
      };

      if (cardsPayload.cards.length === 0) {
        setLoading(false);
        setError("Add at least one card with a prompt and answer");
        return;
      }

      payload = cardsPayload;
    } else {
      const itemsPayload = {
        ...basePayload,
        type: "CHECKLIST" as const,
        items: items
          .filter((item) => item.title.trim())
          .map((item) => ({
            title: item.title.trim(),
            description: item.description.trim() || undefined,
          })),
      };

      if (itemsPayload.items.length === 0) {
        setLoading(false);
        setError("Add at least one checklist item with a title");
        return;
      }

      payload = itemsPayload;
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

      setSuccess("Subject created! Redirecting");
      setTitle("");
      setDescription("");
      setCards([createEmptyCard(), createEmptyCard()]);
      setItems([createEmptyItem(), createEmptyItem()]);
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
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/5 bg-white/5 p-3">
        <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Subject type
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={subjectType === "FLASHCARDS" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setSubjectType("FLASHCARDS")}
          >
            Flashcards
          </Button>
          <Button
            type="button"
            variant={subjectType === "CHECKLIST" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setSubjectType("CHECKLIST")}
          >
            Checklist
          </Button>
        </div>
      </div>
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
              {subjectType === "FLASHCARDS" ? "Cards" : "Checklist items"}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {subjectType === "FLASHCARDS"
                ? "Fill in at least one card to get started."
                : "Add the steps or tasks you want to practice."}
            </p>
          </div>
          <span className="text-xs text-slate-400">{completion}% ready</span>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {subjectType === "FLASHCARDS"
            ? cards.map((card) => (
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
              ))
            : items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/5 bg-slate-950/60 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">Item</h4>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-xs text-rose-300 hover:text-rose-200"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <Input
                    label="Title"
                    placeholder="Warm-up scales"
                    value={item.title}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      updateItem(item.id, "title", event.target.value)
                    }
                    className="mt-3"
                    required
                  />
                  <TextArea
                    label="Notes"
                    placeholder="Optional details or reminders"
                    value={item.description}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      updateItem(item.id, "description", event.target.value)
                    }
                    className="mt-3"
                    rows={3}
                  />
                </div>
              ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={subjectType === "FLASHCARDS" ? addCard : addItem}
          >
            Add another {subjectType === "FLASHCARDS" ? "card" : "item"}
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
