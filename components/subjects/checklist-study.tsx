"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ChecklistItem = {
  id: string;
  title: string;
  description: string | null;
  lastPracticedAt: string | null;
};

type RecentEntry = {
  id: string;
  itemTitle: string;
  practicedAt: string;
};

type ChecklistStudyProps = {
  subjectId: string;
  items: ChecklistItem[];
  recentEntries: RecentEntry[];
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleDateString();
};

export function ChecklistStudy({
  subjectId,
  items,
  recentEntries,
}: ChecklistStudyProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const toggleSelection =
    (itemId: string) => (event: ChangeEvent<HTMLInputElement>) => {
      setError(null);
      setSuccess(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (event.target.checked) {
          next.add(itemId);
        } else {
          next.delete(itemId);
        }
        return next;
      });
    };

  async function logPractice() {
    if (selectedIds.size === 0) {
      setError("Select at least one item first");
      return;
    }

    setLogging(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/subjects/${subjectId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: Array.from(selectedIds) }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to log practice");
      }

      setSuccess("Practice logged");
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Checklist run
          </p>
          <h2 className="text-2xl font-semibold text-white">
            Select the items you practiced today
          </h2>
        </div>
        <div className="text-sm text-slate-300">
          <p>{selectedIds.size} selected</p>
        </div>
      </header>

      {items.length === 0 && (
        <p className="text-sm text-slate-400">
          No checklist items yet. Ask the owner to add them.
        </p>
      )}

      <ul className="space-y-3">
        {items.map((item) => {
          const isSelected = selectedIds.has(item.id);

          return (
            <li
              key={item.id}
              className={`flex flex-col gap-3 rounded-3xl border p-4 shadow-sm transition-all duration-300 sm:flex-row sm:items-center sm:justify-between ${
                isSelected
                  ? "border-emerald-400/60 bg-emerald-500/15 shadow-[0_20px_60px_-30px_rgba(16,185,129,0.7)] backdrop-blur"
                  : "border-white/5 bg-slate-950/70"
              }`}
            >
              <label className="flex flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="peer mt-1 size-4 cursor-pointer rounded border border-white/20 bg-transparent text-emerald-400 transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                  checked={isSelected}
                  onChange={toggleSelection(item.id)}
                />
                <span className="flex flex-col">
                  <span className="text-base font-semibold text-white">
                    {item.title}
                  </span>
                  {item.description && (
                    <p className="mt-1 text-sm text-slate-300">
                      {item.description}
                    </p>
                  )}
                  {isSelected && (
                    <span className="mt-2 inline-flex items-center gap-2 text-xs text-emerald-200 transition-opacity duration-300">
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-400/20 text-sm">
                        ✓
                      </span>
                      Marked for today
                    </span>
                  )}
                </span>
              </label>
              <p
                className={`text-xs uppercase tracking-[0.3em] transition-colors duration-300 ${
                  isSelected ? "text-emerald-200" : "text-slate-500"
                }`}
              >
                Last practiced {formatDate(item.lastPracticedAt)}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-400">
          {error && (
            <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-rose-300">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-300">
              {success}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          onClick={logPractice}
          loading={logging}
          disabled={items.length === 0}
        >
          Log practice
        </Button>
      </div>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
          Recent practice
        </h3>
        {recentEntries.length === 0 && (
          <p className="mt-2 text-sm text-slate-400">
            No practice logged yet. Start by selecting the items above.
          </p>
        )}
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          {recentEntries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
            >
              <span className="text-slate-200">{entry.itemTitle}</span>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-500">
                {new Date(entry.practicedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
