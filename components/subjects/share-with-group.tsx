"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/field-styles";

type Role = "VIEWER" | "EDITOR";

interface ShareWithGroupProps {
  subjectId: string;
  groupName: string;
  /** The level it is shared at now, or null if it is not shared. */
  currentRole: Role | null;
}

const ROLE_LABEL: Record<Role, string> = {
  VIEWER: "Viewer (can study it)",
  EDITOR: "Editor (can also change it)",
};

/**
 * Lets the owner of a subject share it with everyone in their group, including
 * people who join later, or stop sharing it.
 */
export function ShareWithGroup({
  subjectId,
  groupName,
  currentRole,
}: ShareWithGroupProps) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(currentRole ?? "VIEWER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE") {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/subjects/${subjectId}/group`, {
        method,
        ...(method === "PUT"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role }),
            }
          : {}),
      });

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

  return (
    <section aria-labelledby="share-group-heading" className="space-y-4">
      <div>
        <h3 id="share-group-heading" className="text-lg font-semibold text-white">
          Share with your group
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          {currentRole
            ? `Everyone in ${groupName} can open this subject as ${
                currentRole === "EDITOR" ? "an editor" : "a viewer"
              }, including people who join later.`
            : `Let everyone in ${groupName} study this subject. People who join later get it too.`}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Group members can be</span>
          <select
            value={role}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setRole(event.target.value as Role)
            }
            className={fieldClasses}
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <Button
            type="button"
            loading={loading}
            disabled={loading || role === currentRole}
            onClick={() => send("PUT")}
          >
            {currentRole ? "Update access" : `Share with ${groupName}`}
          </Button>
          {currentRole && (
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => send("DELETE")}
            >
              Stop sharing
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
