import { ForwardedRef, forwardRef, TextareaHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";
import { fieldClasses, fieldErrorClasses } from "@/components/ui/field-styles";

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
          fieldClasses,
          "rounded-2xl py-3",
          error && fieldErrorClasses,
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
