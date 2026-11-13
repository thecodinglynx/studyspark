"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-styles";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/local-time";
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
  groupId: string | null;
  groupName: string | null;
  subjectIds: string[];
  subjectTitles: string[];
}

interface GroupOption {
  id: string;
  name: string;
}

// Values for the group choice that are not a group.
const NEW_GROUP = "__new__";
const NO_GROUP = "__none__";

interface InviteManagerProps {
  subjects: AdminSubject[];
  codes: AdminInviteCode[];
  groups: GroupOption[];
}

export function InviteManager({ subjects, codes, groups }: InviteManagerProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [maxUses, setMaxUses] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [group, setGroup] = useState(NEW_GROUP);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
          // Left out, a new group named after the code is made.
          ...(group === NO_GROUP ? { groupId: null } : {}),
          ...(group !== NEW_GROUP && group !== NO_GROUP ? { groupId: group } : {}),
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
      setGroup(NEW_GROUP);
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

          <label className="flex flex-col gap-1 text-sm text-slate-300">
            <span className="font-medium text-slate-200">Group</span>
            <select
              value={group}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setGroup(event.target.value)
              }
              className={fieldClasses}
            >
              <option value={NEW_GROUP}>New group named after the code</option>
              {groups.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              <option value={NO_GROUP}>No group</option>
            </select>
            <span className="text-xs text-slate-400">
              Everyone who signs up with this code joins this group.
            </span>
          </label>

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
              className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-white/5 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 text-sm">
                  <p className="font-mono text-xl tracking-[0.25em] text-white">
                    {code.code}
                  </p>
                  <p className="text-slate-300">
                    {code.role === "EDITOR" ? "Editor" : "Viewer"} access to{" "}
                    {code.subjectTitles.join(", ")}
                  </p>
                  <p className="text-sm text-slate-300">
                    {code.groupName
                      ? `Signups join the group “${code.groupName}”`
                      : "Signups are not put in a group"}
                  </p>
                  <p className="text-xs text-slate-400">
                    Used {code.usedCount}
                    {code.maxUses !== null ? ` of ${code.maxUses}` : ""}{" "}
                    {code.usedCount === 1 ? "time" : "times"} · created{" "}
                    <LocalTime value={code.createdAt} variant="date" />
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={loading}
                    aria-expanded={editingId === code.id}
                    onClick={() =>
                      setEditingId(editingId === code.id ? null : code.id)
                    }
                  >
                    {editingId === code.id ? "Close" : "Edit"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={loading}
                    onClick={() => handleRevoke(code.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
              {editingId === code.id && (
                <CodeEditor
                  code={code}
                  subjects={subjects}
                  groups={groups}
                  onClose={() => setEditingId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

interface CodeEditorProps {
  code: AdminInviteCode;
  subjects: AdminSubject[];
  groups: GroupOption[];
  onClose: () => void;
}

/**
 * Changes the subjects, access level and signup limit of an existing code.
 * The code itself is shown but cannot be edited.
 */
function CodeEditor({ code, subjects, groups, onClose }: CodeEditorProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(code.subjectIds)
  );
  const [role, setRole] = useState<"VIEWER" | "EDITOR">(code.role);
  const [maxUses, setMaxUses] = useState(
    code.maxUses === null ? "" : String(code.maxUses)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupChoice, setGroupChoice] = useState(code.groupId ?? NO_GROUP);

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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected.size === 0) {
      setError("A code needs at least one subject. Revoke it instead to stop it being used.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/invite-codes/${code.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectIds: Array.from(selected),
          role,
          maxUses: maxUses.trim() ? Number(maxUses) : null,
          groupId: groupChoice === NO_GROUP ? null : groupChoice,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to save changes");
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      role="group"
      aria-label={`Edit ${code.code}`}
      className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-slate-950/40 p-4"
    >
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
          Edit code
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          The code <span className="font-mono text-slate-200">{code.code}</span>{" "}
          itself can&apos;t be changed. Edits apply to people who sign up from
          now on; anyone who already used this code keeps the access they got.
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

      <p className="text-sm text-slate-400">
        {selected.size} of {subjects.length} subjects selected.
      </p>

      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {visibleSubjects.length === 0 && (
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
                <span className="font-medium text-white">{subject.title}</span>
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

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        <span className="font-medium text-slate-200">Group</span>
        <select
          value={groupChoice}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            setGroupChoice(event.target.value)
          }
          className={fieldClasses}
        >
          <option value={NO_GROUP}>No group</option>
          {groups.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">
          Where people who sign up with this code from now on are put. People
          who already used it are not moved.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Access level</span>
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
          min={Math.max(1, code.usedCount)}
          placeholder="Unlimited"
          description={`Already used ${code.usedCount} ${
            code.usedCount === 1 ? "time" : "times"
          }.`}
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

      <div className="flex gap-3">
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
