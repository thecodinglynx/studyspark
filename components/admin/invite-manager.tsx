"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-styles";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";

interface AdminSubject {
  id: string;
  title: string;
  type: "FLASHCARDS" | "CHECKLIST";
  ownerUsername: string;
  itemCount: number;
}

interface AdminInviteCode {
  id: string;
  code: string;
  role: "VIEWER" | "EDITOR";
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
  subjectTitles: string[];
}

interface InviteManagerProps {
  subjects: AdminSubject[];
  codes: AdminInviteCode[];
}

export function InviteManager({ subjects, codes }: InviteManagerProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [maxUses, setMaxUses] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const visibleSubjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return subjects;
    return subjects.filter(
      (subject) =>
        subject.title.toLowerCase().includes(term) ||
        subject.ownerUsername.toLowerCase().includes(term)
    );
  }, [search, subjects]);

  function toggle(subjectId: string, checked: boolean) {
    setCreatedCode(null);
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(subjectId);
      } else {
        next.delete(subjectId);
      }
      return next;
    });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one subject first");
      return;
    }

    setLoading(true);
    setError(null);
    setCreatedCode(null);

    try {
      const response = await fetch("/api/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectIds: Array.from(selected),
          role,
          maxUses: maxUses.trim() ? Number(maxUses) : null,
          code: customCode.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to create invite code");
      }

      const created = (await response.json()) as { code: string };
      setCreatedCode(created.code);
      setSelected(new Set());
      setMaxUses("");
      setCustomCode("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(codeId: string) {
    const confirmed = window.confirm(
      "Revoke this code? Nobody will be able to sign up with it. People who already used it keep their access."
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/invite-codes/${codeId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to revoke code");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <Panel className="bg-slate-900/70 p-6">
        <form onSubmit={handleCreate} className="flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Create an invite code
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {selected.size} of {subjects.length} subjects selected.
            </p>
          </div>

          <Input
            label="Find a subject"
            placeholder="Search by title or owner"
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setSearch(event.target.value)
            }
          />

          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {subjects.length === 0 && (
              <li className="text-sm text-slate-400">
                No subjects have been created yet.
              </li>
            )}
            {subjects.length > 0 && visibleSubjects.length === 0 && (
              <li className="text-sm text-slate-400">
                No subjects match your search.
              </li>
            )}
            {visibleSubjects.map((subject) => (
              <li key={subject.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 cursor-pointer accent-blue-500"
                    checked={selected.has(subject.id)}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      toggle(subject.id, event.target.checked)
                    }
                  />
                  <span className="flex flex-col text-sm">
                    <span className="font-medium text-white">
                      {subject.title}
                    </span>
                    <span className="text-xs text-slate-400">
                      {subject.type === "FLASHCARDS"
                        ? `${subject.itemCount} cards`
                        : `${subject.itemCount} checklist items`}{" "}
                      · by {subject.ownerUsername}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <Input
            label="Custom code (optional)"
            placeholder="Leave blank to generate one"
            description="4 to 32 letters and numbers, for example karateisfun. Codes are not case-sensitive and are shown in capitals."
            value={customCode}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setCustomCode(event.target.value)
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              <span className="font-medium text-slate-200">
                Access level
              </span>
              <select
                value={role}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setRole(event.target.value as "VIEWER" | "EDITOR")
                }
                className={fieldClasses}
              >
                <option value="VIEWER">Viewer (study only)</option>
                <option value="EDITOR">Editor (can change cards)</option>
              </select>
            </label>
            <Input
              label="Maximum signups (optional)"
              type="number"
              min={1}
              placeholder="Unlimited"
              value={maxUses}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setMaxUses(event.target.value)
              }
            />
          </div>

          {error && (
            <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
              {error}
            </p>
          )}
          {createdCode && (
            <div className="rounded-xl bg-emerald-500/10 p-4 text-emerald-200">
              <p className="text-sm">Code created. Share it with new users:</p>
              <p
                className="mt-2 break-all font-mono text-3xl tracking-[0.3em] text-white"
                data-testid="created-code"
              >
                {createdCode}
              </p>
            </div>
          )}

          <Button type="submit" size="lg" loading={loading}>
            Generate code
          </Button>
        </form>
      </Panel>

      <Panel className="bg-slate-900/70 p-6">
        <h2 className="text-lg font-semibold text-white">Existing codes</h2>
        <ul className="mt-4 space-y-3">
          {codes.length === 0 && (
            <li className="text-sm text-slate-400">No invite codes yet.</li>
          )}
          {codes.map((code) => (
            <li
              key={code.id}
              className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/5 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="space-y-1 text-sm">
                <p className="font-mono text-xl tracking-[0.25em] text-white">
                  {code.code}
                </p>
                <p className="text-slate-300">
                  {code.role === "EDITOR" ? "Editor" : "Viewer"} access to{" "}
                  {code.subjectTitles.join(", ")}
                </p>
                <p className="text-xs text-slate-400">
                  Used {code.usedCount}
                  {code.maxUses !== null ? ` of ${code.maxUses}` : ""}{" "}
                  {code.usedCount === 1 ? "time" : "times"} · created{" "}
                  {new Date(code.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={() => handleRevoke(code.id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
