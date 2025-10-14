"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";

interface ChecklistItemSummary {
  id: string;
  title: string;
  description: string | null;
}

interface ChecklistEditorProps {
  subjectId: string;
  items: ChecklistItemSummary[];
  canEdit: boolean;
}

export function ChecklistEditor({
  subjectId,
  items,
  canEdit,
}: ChecklistEditorProps) {
  const router = useRouter();
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  if (!canEdit) {
    return null;
  }

  function resetNewItemForm() {
    setNewTitle("");
    setNewDescription("");
  }

  function resetEditingState() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
  }

  async function handleAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTitle.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/subjects/${subjectId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim()
            ? newDescription.trim()
            : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to add checklist item");
      }

      resetNewItemForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function beginEditing(item: ChecklistItemSummary) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description ?? "");
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) {
      return;
    }
    if (!editTitle.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/subjects/${subjectId}/items/${editingId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle.trim(),
            description: editDescription.trim() ? editDescription.trim() : null,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to update checklist item");
      }

      resetEditingState();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    const confirmed = window.confirm("Remove this checklist item?");
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/subjects/${subjectId}/items/${itemId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to remove checklist item");
      }

      if (editingId === itemId) {
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
        <h3 className="text-lg font-semibold text-white">Checklist manager</h3>
        <p className="text-sm text-slate-400">
          Add, update, or remove items for this checklist subject.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <form
        onSubmit={handleAddItem}
        className="space-y-4 rounded-2xl border border-white/5 bg-white/5 p-4"
      >
        <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
          Add new checklist item
        </h4>
        <Input
          label="Title"
          placeholder="Item title"
          value={newTitle}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setNewTitle(event.target.value)
          }
          required
        />
        <TextArea
          label="Notes"
          placeholder="Optional description or reminders"
          value={newDescription}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setNewDescription(event.target.value)
          }
          rows={3}
        />
        <Button type="submit" loading={loading} disabled={loading}>
          Add item
        </Button>
      </form>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
          Existing items
        </h4>
        {items.length === 0 && (
          <p className="text-sm text-slate-400">
            No items yet. Add your first one above.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-4"
          >
            {editingId === item.id ? (
              <form onSubmit={handleSaveEdit} className="space-y-3">
                <Input
                  label="Title"
                  value={editTitle}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setEditTitle(event.target.value)
                  }
                  required
                />
                <TextArea
                  label="Notes"
                  value={editDescription}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setEditDescription(event.target.value)
                  }
                  rows={3}
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
                    Title
                  </p>
                  <p className="mt-1 text-sm text-slate-100">{item.title}</p>
                </div>
                {item.description && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-100">
                      {item.description}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => beginEditing(item)}
                    disabled={loading}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteItem(item.id)}
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
