import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border/80 bg-surface p-5 shadow-card transition-shadow duration-180",
        className,
      )}
      {...props}
    />
  );
}
