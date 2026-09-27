import { Check, LockKeyhole, Trophy } from "lucide-react";
import type { Achievement } from "@/types/progress";
import { ProgressBar } from "@/components/ui/progress-bar";

export function AchievementCard({ achievement }: { achievement: Achievement }) {
  return (
    <article className={`rounded-2xl border p-4 ${achievement.earned ? "border-moss-200 bg-moss-50" : "border-border bg-surface"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid size-10 place-items-center rounded-2xl ${achievement.earned ? "bg-moss-600 text-white" : "bg-surface-muted text-muted"}`}>
          {achievement.earned ? <Trophy className="size-4" /> : <LockKeyhole className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">{achievement.title}</h3>{achievement.earned && <Check className="size-4 text-moss-700" />}</div>
          <p className="mt-1 text-xs leading-5 text-muted">{achievement.description}</p>
          {!achievement.earned && <><ProgressBar value={(achievement.progress / achievement.target) * 100} className="mt-3 h-1.5" /><p className="mt-1 text-[10px] tabular-nums text-muted">{achievement.progress} / {achievement.target}</p></>}
        </div>
      </div>
    </article>
  );
}
