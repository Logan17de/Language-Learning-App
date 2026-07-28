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
          <li key={stage} className={`flex items-center gap-3 rounded-2xl p-3 ${active ? "bg-moss-50" : ""}`}>
            <span className={`grid size-8 place-items-center rounded-full ${complete ? "bg-moss-600 text-white" : active ? "bg-persimmon-100 text-persimmon-600" : "bg-stone-100 text-stone-300"}`}>
              {complete ? <Check className="size-4" /> : active ? <LoaderCircle className="size-4 animate-spin" /> : <Circle className="size-3" />}
            </span>
            <span className={`text-sm font-semibold ${index <= currentIndex ? "text-ink" : "text-stone-300"}`}>{stage}</span>
          </li>
        );
      })}
    </ol>
  );
}
