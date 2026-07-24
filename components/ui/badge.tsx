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
    moss: "bg-moss-100 text-moss-700",
    orange: "bg-persimmon-100 text-persimmon-600",
    neutral: "bg-stone-100 text-stone-600",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
