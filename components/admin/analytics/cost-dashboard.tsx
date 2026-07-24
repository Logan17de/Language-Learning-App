"use client";

import { CircleDollarSign, Database, Recycle, Sparkles } from "lucide-react";
import { costRecords } from "@/data/mock-admin";
import { AdminPageHeader, AdminSection, AdminStatCard, AdminTable } from "@/components/admin/admin-primitives";

export function CostDashboard() {
  const today = costRecords.reduce((sum, item) => sum + item.today, 0);
  const month = costRecords.reduce((sum, item) => sum + item.currentMonth, 0);
  const activeUsers = 428;
  const generatedLessons = 94;
  const reusedLessons = 1210;
  const avoided = 860;
  const savings = 432.6;
  return (
    <>
      <AdminPageHeader eyebrow="AI & operational economics" title="Cost dashboard" description="A realistic deterministic model of future AI and operational spend. No service is called and no cost is incurred." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminStatCard label="Today" value={`$${today.toFixed(2)}`} /><AdminStatCard label="Current month" value={`$${month.toFixed(2)}`} tone="orange" /><AdminStatCard label="Cost / active user" value={`$${(month / activeUsers).toFixed(2)}`} tone="blue" /><AdminStatCard label="Estimated monthly cost" value={`$${(month / 24 * 30).toFixed(2)}`} detail="Projected from current deterministic run rate" /></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_.8fr]">
        <AdminSection title="Cost categories" description="Planning, creation, validation, assets, speaking, support, storage, and email."><AdminTable caption="Mock operational cost records" headers={["Category", "Today", "Month", "Units", "Cost / unit"]} rows={costRecords.map((item) => ({ id: item.id, cells: [item.category, `$${item.today.toFixed(2)}`, `$${item.currentMonth.toFixed(2)}`, `${item.units.toLocaleString()} ${item.unit}`, `$${(item.currentMonth / Math.max(1, item.units)).toFixed(3)}`] }))} /></AdminSection>
        <AdminSection title="Library-first savings" description="Reuse stored content before generating new content.">
          <div className="space-y-3"><Saving icon={<Database className="size-5" />} label="Reused stored lessons" value={reusedLessons.toLocaleString()} /><Saving icon={<Sparkles className="size-5" />} label="AI generations avoided" value={avoided.toLocaleString()} /><Saving icon={<Recycle className="size-5" />} label="Generated lessons reused" value="286" /><Saving icon={<CircleDollarSign className="size-5" />} label="Estimated savings" value={`$${savings.toFixed(2)}`} /></div>
          <div className="mt-5 rounded-xl bg-teal-50 p-4"><div className="flex justify-between text-sm font-bold text-teal-900"><span>Cache / reuse rate</span><span>71%</span></div><div className="mt-2 h-3 rounded-full bg-white"><div className="h-full w-[71%] rounded-full bg-teal-600" /></div><p className="mt-3 text-xs text-teal-800">Cost per lesson: ${(month / 6190).toFixed(3)} · cost per generated lesson: ${(month / generatedLessons).toFixed(2)}</p></div>
        </AdminSection>
      </div>
    </>
  );
}
function Saving({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-4"><span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">{icon}</span><span className="flex-1 text-sm font-semibold text-slate-600">{label}</span><strong className="text-xl">{value}</strong></div>; }
