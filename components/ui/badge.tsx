import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "moss",
  className,
}: {
  children: ReactNode;
  tone?: "moss" | "orange" | "neutral";
  className?: string;
}) {
  const tones = {
    moss: "border-moss-200/70 bg-moss-100 text-moss-700",
    orange: "border-persimmon-200/70 bg-persimmon-100 text-persimmon-700",
    neutral: "border-border bg-surface-muted text-muted",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
