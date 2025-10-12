import { HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        "rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-slate-950/60 backdrop-blur-xl transition hover:border-slate-700",
        className
      )}
      {...props}
    />
  );
}
