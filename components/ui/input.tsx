import { forwardRef, InputHTMLAttributes, ForwardedRef } from "react";
import { twMerge } from "tailwind-merge";
import { fieldClasses, fieldErrorClasses } from "@/components/ui/field-styles";

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
        className={twMerge(fieldClasses, error && fieldErrorClasses, className)}
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
