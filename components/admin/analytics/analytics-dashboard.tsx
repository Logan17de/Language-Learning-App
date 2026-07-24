"use client";

import { analyticsSnapshot } from "@/data/mock-admin";
import { AdminPageHeader, AdminSection, AdminStatCard } from "@/components/admin/admin-primitives";

export function AnalyticsDashboard() {
  const usageEntries = Object.entries(analyticsSnapshot.usage);
  return (
    <>
      <AdminPageHeader eyebrow="Product intelligence" title="Analytics" description={`Deterministic usage, retention, learning, content, and conversion snapshot captured ${analyticsSnapshot.capturedAt}.`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{usageEntries.slice(0, 4).map(([label, value], index) => <AdminStatCard key={label} label={label} value={value.toLocaleString()} tone={index === 1 ? "blue" : index === 2 ? "orange" : "teal"} />)}</div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminSection title="Daily active users" description="Seven-day deterministic trend."><BarChart data={analyticsSnapshot.dailySeries} suffix="" /></AdminSection>
        <AdminSection title="Retention cohorts" description="Day-30 retention by acquisition month."><BarChart data={analyticsSnapshot.cohortSeries} suffix="%" /></AdminSection>
        <MetricSection title="Usage" data={analyticsSnapshot.usage} />
        <MetricSection title="Retention" data={analyticsSnapshot.retention} percent />
        <MetricSection title="Learning" data={analyticsSnapshot.learning} percent />
        <MetricSection title="Content" data={analyticsSnapshot.content} />
        <AdminSection title="Content demand and quality"><div className="space-y-4"><Progress label="Most popular: Train transfer" value={92} /><Progress label="Highest completion: Café" value={91} /><Progress label="Lowest completion: Interview" value={58} /><Progress label="Most reported: IT support" value={46} /><Progress label="Generated share" value={20} /><Progress label="Work topic demand" value={28} /></div></AdminSection>
        <MetricSection title="Conversion" data={analyticsSnapshot.conversion} percent />
      </div>
    </>
  );
}

function MetricSection({ title, data, percent = false }: { title: string; data: Record<string, number>; percent?: boolean }) {
  return <AdminSection title={title}><div className="grid gap-3 sm:grid-cols-2">{Object.entries(data).map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><span className="text-xs font-semibold text-slate-500">{label}</span><strong className="mt-1 block text-2xl text-slate-900">{value.toLocaleString()}{percent ? "%" : ""}</strong></div>)}</div></AdminSection>;
}

function BarChart({ data, suffix }: { data: Array<{ label: string; value: number }>; suffix: string }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return <div className="flex h-56 items-end gap-3" role="img" aria-label={data.map((item) => `${item.label}: ${item.value}${suffix}`).join(", ")}>{data.map((item) => <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center"><span className="mb-2 text-xs font-bold text-slate-600">{item.value}{suffix}</span><div className="mx-auto w-full max-w-12 rounded-t-lg bg-teal-500" style={{ height: `${Math.max(8, (item.value / max) * 78)}%` }} /><span className="mt-2 text-xs text-slate-500">{item.label}</span></div>)}</div>;
}

function Progress({ label, value }: { label: string; value: number }) { return <div><div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{value}%</strong></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-500" style={{ width: `${value}%` }} /></div></div>; }
