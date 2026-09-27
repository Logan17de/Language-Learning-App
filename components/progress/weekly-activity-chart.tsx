import type { WeeklyActivity } from "@/types/progress";

export function WeeklyActivityChart({ activity }: { activity: WeeklyActivity[] }) {
  const max = Math.max(45, ...activity.map((item) => item.minutes));
  return (
    <div className="mt-6 flex h-48 items-end gap-3" role="img" aria-label={`Weekly activity: ${activity.map((item) => `${item.day} ${item.minutes} minutes`).join(", ")}`}>
      {activity.map((item, index) => (
        <div key={`${item.day}-${index}`} className="flex h-full flex-1 flex-col justify-end gap-2">
          <span className="text-center text-[10px] font-semibold tabular-nums text-muted">{item.minutes || ""}</span>
          <div className="relative flex flex-1 items-end overflow-hidden rounded-xl bg-moss-50">
            <div className={`w-full rounded-xl ${index === 4 ? "bg-persimmon-400" : "bg-moss-500"}`} style={{ height: `${Math.max(4, (item.minutes / max) * 100)}%` }} />
          </div>
          <span className="text-center text-[10px] font-semibold text-muted">{item.day}</span>
        </div>
      ))}
    </div>
  );
}
