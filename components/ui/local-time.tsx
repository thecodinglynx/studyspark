"use client";

import { useSyncExternalStore } from "react";
import { twMerge } from "tailwind-merge";

type Variant = "datetime" | "date";

const OPTIONS: Record<Variant, Intl.DateTimeFormatOptions> = {
  datetime: {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  date: { year: "numeric", month: "short", day: "numeric" },
};

// There is nothing to subscribe to: the browser's timezone does not change
// while a page is open. The hook is used for its two snapshots.
const subscribe = () => () => {};

interface LocalTimeProps {
  /** An ISO timestamp, such as "2026-11-13T03:28:51.000Z". */
  value: string;
  variant?: Variant;
  className?: string;
}

/**
 * Shows a moment in the viewer's own timezone and language, on one line.
 *
 * Pages are first built on the server, whose timezone is UTC, so a time
 * formatted there would be hours off for the viewer. The server's markup shows
 * UTC; once the page reaches the browser the time is re-formatted for the
 * viewer. useSyncExternalStore is how React is told "the server and the
 * browser legitimately differ here", so there is no hydration warning.
 */
export function LocalTime({
  value,
  variant = "datetime",
  className,
}: LocalTimeProps) {
  const text = useSyncExternalStore(
    subscribe,
    () => format(value, variant, undefined),
    () => format(value, variant, { locale: "en-US", timeZone: "UTC" })
  );

  return (
    <time dateTime={value} className={twMerge("whitespace-nowrap", className)}>
      {text}
    </time>
  );
}

function format(
  value: string,
  variant: Variant,
  forced: { locale: string; timeZone: string } | undefined
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(forced?.locale, {
    ...OPTIONS[variant],
    ...(forced ? { timeZone: forced.timeZone } : {}),
  }).format(date);
}
