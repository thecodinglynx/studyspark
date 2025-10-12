import { ForwardedRef, forwardRef, TextareaHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  description?: string;
  error?: string;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    { className, label, description, error, ...props }: TextAreaProps,
    ref: ForwardedRef<HTMLTextAreaElement>
  ) => (
    <label className="flex flex-col gap-1 text-sm text-slate-300">
      {label && <span className="font-medium text-slate-200">{label}</span>}
      <textarea
        ref={ref}
        className={twMerge(
          "w-full rounded-2xl bg-slate-900/80 px-4 py-3 text-slate-100 shadow-inner shadow-slate-950/50 ring-1 ring-transparent transition focus:outline-none focus:ring-2 focus:ring-blue-500",
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

TextArea.displayName = "TextArea";
