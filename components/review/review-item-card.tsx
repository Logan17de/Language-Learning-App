import { AlertCircle, ArrowUpRight, Clock3, Volume2 } from "lucide-react";
import type { ReviewDashboardItem } from "@/types/review-session";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";

export function ReviewItemCard({ item }: { item: ReviewDashboardItem }) {
  return (
    <article className="rounded-2xl border border-black/[.06] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-moss-50 font-serif text-xl font-semibold">{item.term.slice(0, 3)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{item.term}</h3>
            <Badge tone={item.status === "overdue" || item.status === "weak" ? "orange" : "moss"} className="capitalize">{item.status}</Badge>
          </div>
          {(item.reading || item.meaning) && <p className="mt-1 text-xs text-stone-500">{item.reading}{item.reading && item.meaning ? " · " : ""}{item.meaning}</p>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-400">
            <span className="flex items-center gap-1"><Clock3 className="size-3" /> {item.lastReviewed ?? "Not reviewed yet"}</span>
            {item.pronunciation !== undefined && <span className="flex items-center gap-1"><Volume2 className="size-3" /> Pronunciation {item.pronunciation}%</span>}
          </div>
          <div className="mt-3"><div className="mb-1.5 flex justify-between text-[11px]"><span>Recognition confidence</span><span>{item.confidence}%</span></div><ProgressBar value={item.confidence} className="h-1.5" /></div>
          {item.reason && <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-stone-500"><AlertCircle className="mt-0.5 size-3 shrink-0 text-persimmon-500" /> {item.reason}</p>}
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-stone-300" />
      </div>
    </article>
  );
}
