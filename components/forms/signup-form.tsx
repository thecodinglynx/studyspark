"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hardNavigate } from "@/lib/navigate";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      username: formData.get("username")?.toString().trim() ?? "",
      password: formData.get("password")?.toString() ?? "",
      name: formData.get("name")?.toString().trim() || undefined,
      inviteCode: formData.get("inviteCode")?.toString().trim() || undefined,
    };

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Unable to create account");
      }

      const signInResult = await signIn("credentials", {
        redirect: false,
        username: payload.username,
        password: payload.password,
      });

      if (signInResult?.error) {
        throw new Error(signInResult.error);
      }

      hardNavigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Input
        name="name"
        label="Full name (optional)"
        placeholder="Jane Learner"
        autoComplete="name"
      />
      <Input
        name="username"
        label="Username"
        placeholder="janedoe"
        autoComplete="username"
        required
      />
      <Input
        name="password"
        label="Password"
        type="password"
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />
      <Input
        name="inviteCode"
        label="Invite code (optional)"
        placeholder="ABCD2345"
        description="Got a code from an admin? Enter it to get access to their shared subjects."
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      {error && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      <Button type="submit" loading={loading} size="lg">
        Create account
      </Button>
    </form>
  );
}
