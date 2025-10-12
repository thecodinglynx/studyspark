import { Slot } from "@radix-ui/react-slot";
import { ButtonHTMLAttributes, forwardRef, ForwardedRef } from "react";
import { twMerge } from "tailwind-merge";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  asChild?: boolean;
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-blue-500 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-400 focus-visible:outline-blue-300",
  secondary:
    "bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700 focus-visible:outline-slate-400",
  ghost: "bg-transparent text-slate-200 hover:bg-slate-800/60",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      asChild = false,
      type = "button",
      ...props
    }: ButtonProps,
    ref: ForwardedRef<HTMLButtonElement>
  ) => {
    const Component = asChild ? Slot : "button";
    const isDisabled = disabled || loading;
    const componentProps = asChild
      ? props
      : {
          ...props,
          type,
          disabled: isDisabled,
        };

    return (
      <Component
        {...componentProps}
        ref={asChild ? undefined : ref}
        className={twMerge(
          "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          variantStyles[variant],
          sizeStyles[size],
          isDisabled && "opacity-60 cursor-not-allowed",
          className
        )}
        aria-disabled={isDisabled}
      >
        {loading ? <span className="animate-pulse">• • •</span> : children}
      </Component>
    );
  }
);

Button.displayName = "Button";
