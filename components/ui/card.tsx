import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "fantasy-panel rounded-[1.6rem] p-5 transition duration-280 hover:border-moss-300/70 hover:shadow-float",
        className,
      )}
      {...props}
    />
  );
}
