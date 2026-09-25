import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  Info,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type AlertTone = "success" | "warning" | "error" | "info";

const toneClasses: Record<AlertTone, string> = {
  success: "border-positive-border bg-positive-surface text-positive",
  warning: "border-warning-border bg-warning-surface text-warning",
  error: "border-danger-border bg-danger-surface text-danger",
  info: "border-moss-200 bg-moss-50 text-moss-800",
};

const icons = {
  success: CheckCircle2,
  warning: CircleAlert,
  error: AlertCircle,
  info: Info,
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  ...props
}: {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const Icon = icons[tone];
  const liveProps =
    tone === "error"
      ? { role: "alert" as const }
      : { role: "status" as const, "aria-live": "polite" as const };

  return (
    <div
      {...liveProps}
      className={cn("rounded-2xl border p-4", toneClasses[tone], className)}
      {...props}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          {title && <p className="text-sm font-semibold">{title}</p>}
          <div className={cn("text-sm leading-6", title && "mt-1 opacity-85")}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
