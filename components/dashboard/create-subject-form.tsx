"use client";

import { ChangeEvent, FormEvent, useState } from "react";
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

const SUBJECT_TYPES: Array<{
  value: SubjectTypeOption;
  label: string;
  help: string;
}> = [
  {
    value: "FLASHCARDS",
    label: "Flashcards",
    help: "Cards with a prompt on the front and an answer on the back. You flip each one and mark yourself right or wrong.",
  },
  {
    value: "CHECKLIST",
    label: "Checklist",
    help: "A list of things to practice. You tick off what you did each session.",
  },
];

export function CreateSubjectForm() {
  const router = useRouter();
  const [subjectType, setSubjectType] =
    useState<SubjectTypeOption>("FLASHCARDS");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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

  const isFlashcards = subjectType === "FLASHCARDS";
  const filledCount = isFlashcards
    ? cards.filter((card) => card.prompt.trim() && card.answer.trim()).length
    : items.filter((item) => item.title.trim()).length;
  const totalCount = isFlashcards ? cards.length : items.length;

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
    } as const;

    let payload:
      | {
          type: "FLASHCARDS";
          title: string;
          description?: string;
          cards: { prompt: string; answer: string }[];
        }
      | {
          type: "CHECKLIST";
          title: string;
          description?: string;
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
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span
          id="subject-type-label"
          className="text-sm font-medium text-slate-200"
        >
          What are you creating?
        </span>
        <div
          role="radiogroup"
          aria-labelledby="subject-type-label"
          className="inline-flex w-fit gap-1 rounded-full border border-slate-600 bg-slate-800 p-1"
        >
          {SUBJECT_TYPES.map((option) => {
            const selected = subjectType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSubjectType(option.value)}
                className={`rounded-full px-5 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 ${
                  selected
                    ? "bg-blue-500 text-white shadow shadow-blue-500/30"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="max-w-xl text-sm text-slate-400">
          {SUBJECT_TYPES.find((option) => option.value === subjectType)?.help}
        </p>
      </div>

      <div className="flex flex-col gap-5">
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
          label="Description (optional)"
          placeholder="Short summary, e.g. Exam 3 study cards"
          rows={2}
          value={description}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setDescription(event.target.value)
          }
        />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isFlashcards ? "Cards" : "Checklist items"}
            </h2>
            <p className="text-sm text-slate-400">
              {isFlashcards
                ? "Each card has a prompt (the question) and an answer. Add at least one."
                : "Add the steps or tasks you want to practice. Add at least one."}
            </p>
          </div>
          <span className="text-sm text-slate-400" aria-live="polite">
            {filledCount} of {totalCount} {isFlashcards ? "cards" : "items"}{" "}
            filled in
          </span>
        </div>

        <ol className="flex flex-col gap-4">
          {isFlashcards
            ? cards.map((card, index) => (
                <li
                  key={card.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">
                      Card {index + 1}
                    </h3>
                    {cards.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCard(card.id)}
                        aria-label={`Remove card ${index + 1}`}
                        className="rounded-full px-3 py-1 text-xs text-rose-300 transition hover:bg-rose-500/10 hover:text-rose-200"
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
                    required
                  />
                  <TextArea
                    label="Answer"
                    placeholder="Energy cannot be created or destroyed..."
                    value={card.answer}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      updateCard(card.id, "answer", event.target.value)
                    }
                    rows={3}
                    required
                  />
                </li>
              ))
            : items.map((item, index) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">
                      Item {index + 1}
                    </h3>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove item ${index + 1}`}
                        className="rounded-full px-3 py-1 text-xs text-rose-300 transition hover:bg-rose-500/10 hover:text-rose-200"
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
                    required
                  />
                  <TextArea
                    label="Notes (optional)"
                    placeholder="Optional details or reminders"
                    value={item.description}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      updateItem(item.id, "description", event.target.value)
                    }
                    rows={2}
                  />
                </li>
              ))}
        </ol>

        <button
          type="button"
          onClick={isFlashcards ? addCard : addItem}
          className="rounded-2xl border border-dashed border-slate-600 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-blue-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
        >
          + Add another {isFlashcards ? "card" : "item"}
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">
          {success}
        </p>
      )}
      <Button type="submit" loading={loading} size="lg">
        Save subject
      </Button>
    </form>
  );
}
