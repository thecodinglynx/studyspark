"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { hardNavigate } from "@/lib/navigate";

interface DeleteSubjectProps {
  subjectId: string;
  title: string;
}

/**
 * Permanently deletes a subject. Shown to its owner only. Deleting is
 * irreversible and removes everyone's study history for the subject, so it
 * takes two deliberate clicks.
 */
export function DeleteSubject({ subjectId, title }: DeleteSubjectProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/subjects/${subjectId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to delete the subject");
      }

      // A full page load, so no cached page of the deleted subject survives.
      hardNavigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  return (
    <section
      aria-labelledby="delete-subject-heading"
      className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5"
    >
      <h3
        id="delete-subject-heading"
        className="text-sm font-semibold text-rose-200"
      >
        Delete this subject
      </h3>
      <p className="mt-2 text-sm text-slate-300">
        Permanently removes &ldquo;{title}&rdquo; along with its cards or items
        and everyone&apos;s study history for it. Anyone it is shared with
        loses access. This can&apos;t be undone.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300"
        >
          {error}
        </p>
      )}

      {confirming ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            loading={deleting}
            onClick={handleDelete}
            className="bg-rose-500 shadow-rose-500/30 hover:bg-rose-400"
          >
            Yes, delete permanently
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="mt-4 text-rose-200 hover:bg-rose-500/10"
          onClick={() => setConfirming(true)}
        >
          Delete subject…
        </Button>
      )}
    </section>
  );
}
