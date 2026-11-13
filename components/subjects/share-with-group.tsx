"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-styles";

type Role = "VIEWER" | "EDITOR";

/** A group a subject can be shared with, and how it is shared right now. */
export interface GroupTarget {
  id: string;
  name: string;
  /** The level it is shared at now, or null if it is not shared. */
  currentRole: Role | null;
}

const ROLE_LABEL: Record<Role, string> = {
  VIEWER: "Viewer (can study it)",
  EDITOR: "Editor (can also change it)",
};

/** Shares or unshares one subject with one group through the API. */
function useGroupShare(subjectId: string, groupId: string, currentRole: Role | null) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(currentRole ?? "VIEWER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE") {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        method === "PUT"
          ? `/api/subjects/${subjectId}/group`
          : `/api/subjects/${subjectId}/group?groupId=${encodeURIComponent(groupId)}`,
        method === "PUT"
          ? {
              method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role, groupId }),
            }
          : { method }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to update sharing");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return { role, setRole, loading, error, send };
}

function RoleSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Role;
  onChange: (role: Role) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      <span className="font-medium text-slate-200">{label}</span>
      <select
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value as Role)
        }
        className={fieldClasses}
      >
        {(Object.keys(ROLE_LABEL) as Role[]).map((option) => (
          <option key={option} value={option}>
            {ROLE_LABEL[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
      {message}
    </p>
  );
}

interface ShareWithGroupProps {
  subjectId: string;
  /** The groups this subject can be shared with. */
  targets: GroupTarget[];
  /** The user's own group, if they are in one. */
  ownGroupId?: string | null;
}

/**
 * Lets the owner of a subject share it with a group, including people who join
 * later, or stop sharing. Most people can only share with their own group;
 * admins can share with any group.
 */
export function ShareWithGroup({ subjectId, targets, ownGroupId }: ShareWithGroupProps) {
  const single = targets.length === 1;
  const ownGroupOnly = single && targets[0].id === ownGroupId;

  return (
    <section aria-labelledby="share-group-heading" className="space-y-4">
      <div>
        <h3 id="share-group-heading" className="text-lg font-semibold text-white">
          {ownGroupOnly ? "Share with your group" : "Share with a group"}
        </h3>
        {!single && (
          <p className="mt-2 text-sm text-slate-400">
            Choose which groups can open this subject. People who join a group
            later get it too.
          </p>
        )}
      </div>

      <ul className="space-y-6">
        {targets.map((target) => (
          <li key={target.id}>
            <TargetRow subjectId={subjectId} target={target} showName={!single} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TargetRow({
  subjectId,
  target,
  showName,
}: {
  subjectId: string;
  target: GroupTarget;
  showName: boolean;
}) {
  const { role, setRole, loading, error, send } = useGroupShare(
    subjectId,
    target.id,
    target.currentRole
  );
  const current = target.currentRole;

  return (
    <div className="space-y-3">
      {showName ? (
        <div>
          <h4 className="text-base font-semibold text-white">{target.name}</h4>
          <p className="mt-1 text-sm text-slate-400">
            {current
              ? `Shared with everyone in this group as ${current === "EDITOR" ? "an editor" : "a viewer"}.`
              : "Not shared with this group."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          {current
            ? `Everyone in ${target.name} can open this subject as ${
                current === "EDITOR" ? "an editor" : "a viewer"
              }, including people who join later.`
            : `Let everyone in ${target.name} study this subject. People who join later get it too.`}
        </p>
      )}

      <ErrorLine message={error} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <RoleSelect
          label={showName ? `Members of ${target.name} can be` : "Group members can be"}
          value={role}
          onChange={setRole}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            loading={loading}
            disabled={loading || role === current}
            onClick={() => send("PUT")}
          >
            {current ? "Update access" : `Share with ${target.name}`}
          </Button>
          {current && (
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              aria-label={showName ? `Stop sharing with ${target.name}` : undefined}
              onClick={() => send("DELETE")}
            >
              Stop sharing
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One of the user's own subjects, with controls to share it with their group.
 * Used on the Group page so sharing does not have to be hunted for.
 */
export function SubjectGroupShare({
  subjectId,
  title,
  typeLabel,
  target,
}: {
  subjectId: string;
  title: string;
  typeLabel: string;
  target: GroupTarget;
}) {
  const { role, setRole, loading, error, send } = useGroupShare(
    subjectId,
    target.id,
    target.currentRole
  );
  const current = target.currentRole;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-200">
          {typeLabel}
        </span>
        <span
          className={`text-sm ${current ? "text-emerald-300" : "text-slate-400"}`}
        >
          {current
            ? `Shared as ${current === "EDITOR" ? "editor" : "viewer"}`
            : "Not shared"}
        </span>
      </div>

      <ErrorLine message={error} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <RoleSelect label={`Access for ${title}`} value={role} onChange={setRole} />
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            size="sm"
            loading={loading}
            disabled={loading || role === current}
            aria-label={current ? `Update access to ${title}` : `Share ${title}`}
            onClick={() => send("PUT")}
          >
            {current ? "Update access" : "Share"}
          </Button>
          {current && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading}
              aria-label={`Stop sharing ${title}`}
              onClick={() => send("DELETE")}
            >
              Stop sharing
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
