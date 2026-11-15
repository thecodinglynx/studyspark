"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProfileFormProps {
  username: string;
  name: string | null;
}

/** Lets someone change the name shown to others. The login never changes. */
export function ProfileForm({ username, name }: ProfileFormProps) {
  const router = useRouter();
  const { update } = useSession();
  const [value, setValue] = useState(name ?? "");
  const [saved, setSaved] = useState(name ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);
    setLoading(true);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value.trim() || null }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Unable to save your name");
      }

      const data = await response.json();
      setValue(data.name ?? "");
      setSaved(data.name ?? "");
      setDone(true);
      // Refresh the name in the top bar straight away.
      await update();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Input
        name="name"
        label="Name"
        placeholder="Jane Learner"
        autoComplete="name"
        maxLength={64}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setDone(false);
        }}
        description="Shown to you and to people in your group. Leave it empty to show your username."
      />
      <Input
        name="username"
        label="Username"
        value={username}
        readOnly
        disabled
        description="Your username is how you log in, so it can't be changed here."
      />
      {error && (
        <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">
          Saved.
        </p>
      )}
      <div>
        <Button type="submit" loading={loading} disabled={loading || value.trim() === saved}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
