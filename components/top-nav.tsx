"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function TopNav() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const links = [{ href: "/dashboard", label: "Dashboard" }];

  if (status === "authenticated") {
    links.push({ href: "/analytics", label: "Analytics" });
    links.push({ href: "/subjects/new", label: "Create subject" });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-white"
        >
          StudySpark
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition hover:text-white ${
                pathname?.startsWith(link.href)
                  ? "text-white"
                  : "text-slate-400"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {status === "loading" && (
            <span className="text-slate-400">Loading…</span>
          )}
          {status === "unauthenticated" && (
            <Button variant="secondary" size="sm" onClick={() => signIn()}>
              Sign in
            </Button>
          )}
          {status === "authenticated" && session.user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-300">
                {session.user.username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Log out
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
