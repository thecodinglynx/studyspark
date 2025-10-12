import { forwardRef, InputHTMLAttributes, ForwardedRef } from "react";
import { twMerge } from "tailwind-merge";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  description?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, description, error, ...props }: InputProps,
    ref: ForwardedRef<HTMLInputElement>
  ) => (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      {label && <span className="font-medium text-slate-200">{label}</span>}
      <input
        ref={ref}
        className={twMerge(
          "w-full rounded-xl bg-slate-900/80 px-4 py-2 text-slate-100 shadow-inner shadow-slate-950/50 ring-1 ring-transparent transition focus:outline-none focus:ring-2 focus:ring-blue-500",
          error && "ring-2 ring-rose-500",
          className
        )}
        {...props}
      />
      {description && !error && (
        <span className="text-xs text-slate-400">{description}</span>
      )}
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </label>
  )
);

Input.displayName = "Input";
