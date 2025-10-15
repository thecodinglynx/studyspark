"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState, type SVGProps } from "react";
import { Button } from "@/components/ui/button";

export function TopNav() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const links = [{ href: "/dashboard", label: "Dashboard" }];

  if (status === "authenticated") {
    links.push({ href: "/analytics", label: "Analytics" });
    links.push({ href: "/subjects/new", label: "Create subject" });
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);

  const desktopNav = (
    <nav className="hidden items-center gap-6 text-sm sm:flex">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`transition hover:text-white ${
            pathname?.startsWith(link.href) ? "text-white" : "text-slate-400"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );

  const mobileNav = (
    <div className="relative sm:hidden" ref={menuRef}>
      <button
        type="button"
        aria-label="Open navigation menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((prev) => !prev)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-blue-400 hover:text-white"
      >
        <CogIcon className="h-5 w-5" />
      </button>
      {isMenuOpen && (
        <div className="absolute right-0 z-50 mt-3 w-48 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeMenu}
              className={`block rounded-xl px-3 py-2 text-sm transition hover:bg-white/10 ${
                pathname?.startsWith(link.href)
                  ? "text-white"
                  : "text-slate-300"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-white"
        >
          StudySpark
        </Link>
        <div className="flex items-center gap-3">
          {desktopNav}
          {mobileNav}
        </div>
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

function CogIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx={12} cy={12} r={3.5} />
      <path d="M12 3V5" />
      <path d="M12 19v2" />
      <path d="M5 12H3" />
      <path d="M21 12h-2" />
      <path d="M7.05 7.05 5.64 5.64" />
      <path d="M18.36 18.36 16.95 16.95" />
      <path d="M7.05 16.95 5.64 18.36" />
      <path d="M18.36 5.64 16.95 7.05" />
    </svg>
  );
}
