"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      username: formData.get("username")?.toString().trim() ?? "",
      password: formData.get("password")?.toString() ?? "",
      name: formData.get("name")?.toString().trim() || undefined,
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

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Input
        name="name"
        label="Full name"
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
