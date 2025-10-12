"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";

interface CardSummary {
  id: string;
  prompt: string;
  answer: string;
}

interface CardEditorProps {
  subjectId: string;
  cards: CardSummary[];
  canEdit: boolean;
}

export function CardEditor({ subjectId, cards, canEdit }: CardEditorProps) {
  const router = useRouter();
  const [newPrompt, setNewPrompt] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editAnswer, setEditAnswer] = useState("");

  if (!canEdit) {
    return null;
  }

  function resetNewCardForm() {
    setNewPrompt("");
    setNewAnswer("");
  }

  function resetEditingState() {
    setEditingId(null);
    setEditPrompt("");
    setEditAnswer("");
  }

  async function handleAddCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPrompt.trim() || !newAnswer.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/subjects/${subjectId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: newPrompt.trim(),
          answer: newAnswer.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to add card");
      }

      resetNewCardForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function beginEditing(card: CardSummary) {
    setEditingId(card.id);
    setEditPrompt(card.prompt);
    setEditAnswer(card.answer);
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    if (!editPrompt.trim() || !editAnswer.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/subjects/${subjectId}/cards/${editingId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: editPrompt.trim(),
            answer: editAnswer.trim(),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to update card");
      }

      resetEditingState();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteCard(cardId: string) {
    const confirmed = window.confirm("Remove this card?");
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/subjects/${subjectId}/cards/${cardId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to remove card");
      }

      if (editingId === cardId) {
        resetEditingState();
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-white">Card manager</h3>
        <p className="text-sm text-slate-400">
          Add new prompts, tweak existing answers, or remove cards from this
          subject.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <form
        onSubmit={handleAddCard}
        className="space-y-4 rounded-2xl border border-white/5 bg-white/5 p-4"
      >
        <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
          Add new card
        </h4>
        <Input
          label="Prompt"
          placeholder="Question prompt"
          value={newPrompt}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setNewPrompt(event.target.value)
          }
          required
        />
        <TextArea
          label="Answer"
          placeholder="Answer details"
          value={newAnswer}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setNewAnswer(event.target.value)
          }
          rows={4}
          required
        />
        <Button type="submit" loading={loading} disabled={loading}>
          Add card
        </Button>
      </form>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
          Existing cards
        </h4>
        {cards.length === 0 && (
          <p className="text-sm text-slate-400">
            No cards yet. Add your first one above.
          </p>
        )}
        {cards.map((card) => (
          <div
            key={card.id}
            className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-4"
          >
            {editingId === card.id ? (
              <form onSubmit={handleSaveEdit} className="space-y-3">
                <Input
                  label="Prompt"
                  value={editPrompt}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setEditPrompt(event.target.value)
                  }
                  required
                />
                <TextArea
                  label="Answer"
                  value={editAnswer}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setEditAnswer(event.target.value)
                  }
                  rows={4}
                  required
                />
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={loading}
                    disabled={loading}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetEditingState}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Prompt
                  </p>
                  <p className="mt-1 text-sm text-slate-100">{card.prompt}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Answer
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-100">
                    {card.answer}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => beginEditing(card)}
                    disabled={loading}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteCard(card.id)}
                    disabled={loading}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
