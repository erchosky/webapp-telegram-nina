"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  pendingText?: string;
  loading?: boolean;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  pendingText = "Procesando...",
  disabled,
  loading,
  ...props
}: ButtonProps) {
  const { pending } = useFormStatus();
  const isBusy = pending || Boolean(loading);
  const variants = {
    primary: "bg-accent text-black hover:bg-[#d8ba7e] bg-tg-button text-tg-buttonText",
    secondary: "bg-panelSoft text-ink hover:bg-[#282828] border border-borderSoft bg-tg-secondaryBg",
    ghost: "bg-transparent text-muted hover:text-ink hover:bg-panelSoft",
    danger: "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30"
  };
  const sizes = {
    sm: "min-h-10 px-3 py-2 text-sm",
    md: "min-h-11 px-4 py-2 text-sm"
  };

  return (
    <button
      disabled={disabled || isBusy}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {pending ? pendingText : children}
    </button>
  );
}
