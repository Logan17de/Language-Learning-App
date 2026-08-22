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
    ? explanation
    : "Check the correct answer and compare it with your response.";
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border p-4",
        correct
          ? "border-correct-border bg-correct-surface text-correct-ink"
          : "border-wrong-border bg-wrong-surface text-wrong-ink",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{correct ? "Correct." : "Not correct yet."}</p>
          {/* No opacity here: fading this line put the light "not correct"
              state at 3.4:1, under the 4.5 body-text floor. The heading is
              already semibold, so weight carries the hierarchy instead. */}
          {!compact && <p className="mt-1 text-sm leading-6">{detail}</p>}
        </div>
      </div>
    </div>
  );
}
