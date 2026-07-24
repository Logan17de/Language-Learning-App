import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function AnswerFeedback({
  correct,
  explanation,
  compact = false,
}: {
  correct: boolean;
  explanation: string;
  compact?: boolean;
}) {
  const Icon = correct ? CheckCircle2 : XCircle;
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border p-4",
        correct ? "border-moss-200 bg-moss-50 text-moss-900" : "border-persimmon-100 bg-persimmon-50 text-persimmon-600",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{correct ? "That’s right." : "Not quite yet."}</p>
          {!compact && <p className="mt-1 text-sm leading-6 opacity-75">{explanation}</p>}
        </div>
      </div>
    </div>
  );
}
