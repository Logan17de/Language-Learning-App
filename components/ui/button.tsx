import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "dark";

const variants: Record<Variant, string> = {
  primary: "bg-moss-600 text-white shadow-lg shadow-moss-600/20 hover:bg-moss-700 active:translate-y-px",
  secondary: "border border-moss-200 bg-white text-moss-700 hover:bg-moss-50",
  ghost: "text-ink hover:bg-moss-50",
  dark: "bg-ink text-white hover:bg-moss-900",
};

interface SharedProps {
  children: ReactNode;
  className?: string;
  variant?: Variant;
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: SharedProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-moss-200 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    >
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
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-moss-200",
        variants[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}
