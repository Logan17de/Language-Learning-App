import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "dark";

const variants: Record<Variant, string> = {
  primary:
    "border border-moss-500 bg-moss-600 text-white shadow-[inset_0_1px_rgba(255,255,255,.18),0_8px_20px_-12px_rgba(37,51,37,.9)] hover:-translate-y-0.5 hover:bg-moss-700 active:translate-y-0 active:scale-[0.98]",
  secondary:
    "border border-border bg-surface text-moss-700 shadow-[inset_0_1px_rgba(255,255,255,.35)] hover:-translate-y-0.5 hover:border-moss-300 hover:bg-moss-50 active:translate-y-0 active:scale-[0.98]",
  ghost: "text-ink hover:bg-surface-muted active:scale-[0.98]",
  dark: "bg-moss-900 text-white shadow-soft hover:bg-moss-800 active:scale-[0.98]",
};

interface SharedProps {
  children: ReactNode;
  className?: string;
  variant?: Variant;
}

const baseClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold transition duration-180 focus:outline-none focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100";

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: SharedProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(baseClass, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className,
  variant = "primary",
  href,
}: SharedProps & { href: string }) {
  return (
    <Link
      href={href}
      className={cn("group", baseClass, variants[variant], className)}
    >
      {children}
    </Link>
  );
}
