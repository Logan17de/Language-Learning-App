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
  const detail = correct
    ? explanation || "You matched the expected answer."
    : "Check the correct answer and compare it with your response.";
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border p-4",
        correct
          ? "border-positive-border bg-positive-surface text-positive"
          : "border-danger-border bg-danger-surface text-danger",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{correct ? "Correct." : "Not correct yet."}</p>
          {!compact && <p className="mt-1 text-sm leading-6 opacity-85">{detail}</p>}
        </div>
      </div>
    </div>
  );
}
