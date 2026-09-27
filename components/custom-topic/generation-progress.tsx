import { Check, Circle, LoaderCircle } from "lucide-react";
export function GenerationProgress({
  stages,
  currentIndex,
}: {
  stages: string[];
  currentIndex: number;
}) {
  return (
    <ol className="space-y-3" aria-label="Custom lesson creation progress">
      {stages.map((stage, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={stage} aria-current={active ? "step" : undefined} className={`flex items-center gap-3 rounded-2xl p-3 ${active ? "bg-moss-50" : ""}`}>
            <span className={`grid size-8 place-items-center rounded-full ${complete ? "bg-moss-600 text-white" : active ? "bg-persimmon-100 text-persimmon-600" : "bg-surface-muted text-muted"}`}>
              {complete ? <Check className="size-4" aria-hidden="true" /> : active ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Circle className="size-3" aria-hidden="true" />}
            </span>
            <span className={`text-sm font-semibold ${index <= currentIndex ? "text-ink" : "text-muted"}`}>{stage}</span>
          </li>
        );
      })}
    </ol>
  );
}
