import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
  barClassName,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      className={cn("h-2 overflow-hidden rounded-full bg-moss-100", className)}
      role="progressbar"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clampedValue}
    >
      <div
        className={cn(
          "h-full rounded-full bg-moss-600 transition-[width] duration-280 ease-out motion-reduce:transition-none",
          barClassName,
        )}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}
