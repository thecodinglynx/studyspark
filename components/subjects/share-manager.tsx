"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Share {
  id: string;
  username: string;
  name: string | null;
  role: "VIEWER" | "EDITOR";
}

interface ShareManagerProps {
  subjectId: string;
  isOwner: boolean;
  shares: Share[];
}

export function ShareManager({
  subjectId,
  isOwner,
  shares,
}: ShareManagerProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Share["role"]>("VIEWER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/subjects/${subjectId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), role }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to share subject");
      }

      setUsername("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveShare(targetUsername: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/subjects/${subjectId}/share?username=${encodeURIComponent(
          targetUsername
        )}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to remove share");
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
      <div>
        <h2 className="text-lg font-semibold text-white">Sharing</h2>
        <p className="mt-2 text-sm text-slate-400">
          {isOwner
            ? "Invite teammates by username to collaborate or study this subject."
            : "These collaborators have access to this subject."}
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {shares.length === 0 && (
          <p className="text-sm text-slate-400">No collaborators yet.</p>
        )}
        {shares.map((share: Share) => (
          <div
            key={share.id}
            className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-200"
          >
            <div>
              <p className="font-medium text-white">{share.username}</p>
              <p className="text-xs text-slate-400">
                {share.name ?? "No name"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-950/60 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-400">
                {share.role.toLowerCase()}
              </span>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => handleRemoveShare(share.username)}
                  className="text-xs text-rose-300 hover:text-rose-200"
                  disabled={loading}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isOwner && (
        <form onSubmit={handleAddShare} className="space-y-4">
          <Input
            label="Share with username"
            placeholder="teammate"
            value={username}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setUsername(event.target.value)
            }
            required
          />
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            <span className="font-medium text-slate-200">Role</span>
            <select
              value={role}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setRole(event.target.value as Share["role"])
              }
              className="rounded-xl bg-slate-950/70 px-4 py-2 text-slate-200 ring-1 ring-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="VIEWER">Viewer</option>
              <option value="EDITOR">Editor</option>
            </select>
          </label>
          <Button type="submit" loading={loading} size="lg">
            Share subject
          </Button>
        </form>
      )}
    </div>
  );
}
