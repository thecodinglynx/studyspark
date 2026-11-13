"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-styles";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";

export interface AdminPerson {
  id: string;
  username: string;
  name: string | null;
}

export interface AdminGroup {
  id: string;
  name: string;
  members: AdminPerson[];
  codeCount: number;
  subjectCount: number;
}

interface GroupManagerProps {
  groups: AdminGroup[];
  /** People who are not in any group. */
  ungrouped: AdminPerson[];
}

const NO_GROUP = "";

const label = (person: AdminPerson) =>
  person.name?.trim() ? `${person.name} (@${person.username})` : person.username;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export function GroupManager({ groups, ungrouped }: GroupManagerProps) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Runs a request, then refreshes the page. Shows the server's error if any. */
  async function call(
    url: string,
    init: { method: string; body?: unknown },
    failure: string
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: init.method,
        ...(init.body !== undefined
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(init.body),
            }
          : {}),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? failure);
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newName.trim()) return;
    const ok = await call(
      "/api/admin/groups",
      { method: "POST", body: { name: newName } },
      "Failed to create the group"
    );
    if (ok) setNewName("");
  }

  async function handleRename(event: FormEvent<HTMLFormElement>, groupId: string) {
    event.preventDefault();
    if (!draftName.trim()) return;
    const ok = await call(
      `/api/admin/groups/${groupId}`,
      { method: "PATCH", body: { name: draftName } },
      "Failed to rename the group"
    );
    if (ok) setRenamingId(null);
  }

  async function handleDelete(group: AdminGroup) {
    const confirmed = window.confirm(
      `Delete the group "${group.name}"? Its ${plural(group.members.length, "member", "members")} stay${
        group.members.length === 1 ? "s" : ""
      } but are no longer grouped, and the access the group gave them is removed. No accounts or subjects are deleted.`
    );
    if (!confirmed) return;
    await call(
      `/api/admin/groups/${group.id}`,
      { method: "DELETE" },
      "Failed to delete the group"
    );
  }

  async function handleMove(person: AdminPerson, groupId: string) {
    await call(
      `/api/admin/users/${person.id}/group`,
      { method: "PUT", body: { groupId: groupId === NO_GROUP ? null : groupId } },
      "Failed to move the user"
    );
  }

  const memberRow = (person: AdminPerson, currentGroupId: string) => (
    <li
      key={person.id}
      className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-sm text-slate-100">{label(person)}</span>
      <select
        aria-label={`Group for ${person.username}`}
        value={currentGroupId}
        disabled={busy}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          handleMove(person, event.target.value)
        }
        className={`${fieldClasses} sm:w-56`}
      >
        <option value={NO_GROUP}>No group</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    </li>
  );

  return (
    <Panel className="bg-slate-900/70 p-6">
      <h2 className="text-lg font-semibold text-white">Groups</h2>
      <p className="mt-2 text-sm text-slate-400">
        People who sign up with an invite code join that code&apos;s group.
        Group members can see each other, share subjects and compare progress.
        Moving someone out of a group removes the access it gave them and stops
        sharing their own subjects with it.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="New group name"
            placeholder="Karate club"
            value={newName}
            maxLength={60}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setNewName(event.target.value)
            }
          />
        </div>
        <Button type="submit" loading={busy} disabled={busy || !newName.trim()}>
          Create group
        </Button>
      </form>

      <ul className="mt-8 flex flex-col gap-6">
        {groups.length === 0 && (
          <li className="text-sm text-slate-400">No groups yet.</li>
        )}
        {groups.map((group) => (
          <li
            key={group.id}
            className="rounded-2xl border border-white/5 bg-white/5 p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              {renamingId === group.id ? (
                <form
                  onSubmit={(event) => handleRename(event, group.id)}
                  className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
                >
                  <div className="flex-1">
                    <Input
                      label="Group name"
                      value={draftName}
                      maxLength={60}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setDraftName(event.target.value)
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={busy || !draftName.trim()}>
                      Save name
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenamingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div>
                  <h3 className="text-base font-semibold text-white">{group.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {plural(group.members.length, "member", "members")} ·{" "}
                    {plural(group.codeCount, "invite code", "invite codes")} ·{" "}
                    {plural(group.subjectCount, "shared subject", "shared subjects")}
                  </p>
                </div>
              )}
              {renamingId !== group.id && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setRenamingId(group.id);
                      setDraftName(group.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                    onClick={() => handleDelete(group)}
                  >
                    Delete group
                  </Button>
                </div>
              )}
            </div>
            {group.members.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No members yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {group.members.map((person) => memberRow(person, group.id))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <h3 className="text-base font-semibold text-white">
          People without a group ({ungrouped.length})
        </h3>
        {ungrouped.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Everyone is in a group.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {ungrouped.map((person) => memberRow(person, NO_GROUP))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
