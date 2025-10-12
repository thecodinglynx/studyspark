"use client";

import { KeyboardEvent, ReactNode, useState } from "react";
import { twMerge } from "tailwind-merge";

interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  className?: string;
}

export function FlipCard({ front, back, className }: FlipCardProps) {
  const [flipped, setFlipped] = useState<boolean>(false);

  return (
    <div className={twMerge("w-full [perspective:2000px]", className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setFlipped((prev) => !prev)}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setFlipped((prev) => !prev);
          }
        }}
        className={twMerge(
          "relative min-h-[220px] w-full cursor-pointer select-none overflow-hidden rounded-3xl transition-transform duration-500 preserve-3d sm:h-64",
          flipped ? "[transform:rotateY(180deg)]" : ""
        )}
      >
        <div
          className={twMerge(
            "absolute inset-0 flex h-full w-full items-center justify-center break-words bg-gradient-to-br from-blue-500/40 to-purple-500/40 px-4 py-6 text-center text-base font-semibold leading-relaxed text-slate-100 shadow-xl shadow-blue-500/20 [transform:rotateY(0deg)] transition-opacity duration-200 sm:px-6 sm:text-lg",
            flipped
              ? "pointer-events-none opacity-0"
              : "pointer-events-auto opacity-100"
          )}
        >
          {front}
        </div>
        <div
          className={twMerge(
            "absolute inset-0 flex h-full w-full items-center justify-center break-words bg-gradient-to-br from-emerald-500/40 to-cyan-500/40 px-4 py-6 text-center text-base font-semibold leading-relaxed text-slate-100 shadow-xl shadow-emerald-500/20 [transform:rotateY(180deg)] transition-opacity duration-200 sm:px-6 sm:text-lg",
            flipped
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          )}
        >
          {back}
        </div>
      </div>
      <p className="mt-3 text-center text-xs uppercase tracking-[0.3em] text-slate-400">
        click or press space to flip
      </p>
    </div>
  );
}
