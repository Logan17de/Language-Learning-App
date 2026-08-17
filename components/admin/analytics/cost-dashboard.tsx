"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleDollarSign,
  Database,
  HardDrive,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  AdminPageHeader,
  AdminSection,
  AdminStatCard,
  AdminTable,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import {
  adminDashboardRepository,
  type AdminCostData,
} from "@/lib/repositories/admin-dashboard-repository";

export function CostDashboard() {
  const [data, setData] = useState<AdminCostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await adminDashboardRepository.loadCosts(31);
    if (result.ok) setData(result.data);
    else setError(result.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const live = useMemo(() => (data ? deriveCosts(data) : null), [data]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Recorded operational economics"
        title="Cost dashboard"
        description="Spend, usage units, generation volume, and reusable-library activity calculated only from persisted AIko records."
        actions={
          <Button
            type="button"
            variant="secondary"
            className="rounded-xl"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}
      {!live ? (
        <div
          className="h-72 animate-pulse rounded-2xl bg-slate-100"
          aria-label="Loading recorded costs"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              label="Today"
              value={`$${live.today.toFixed(2)}`}
              detail="Recorded cost rows dated today"
            />
            <AdminStatCard
              label="Last 31 days"
              value={`$${live.total.toFixed(2)}`}
              detail={`${live.records} cost records`}
              tone="orange"
            />
            <AdminStatCard
              label="Generation jobs"
              value={live.jobs.toLocaleString()}
              detail={`${live.failedJobs} failed · ${live.averageGenerationSeconds}s average`}
              tone="blue"
            />
            <AdminStatCard
              label="Stored media"
              value={live.assets.toLocaleString()}
              detail={`${data?.imageCount ?? 0} images · ${data?.audioCount ?? 0} audio`}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
            <AdminSection
              title="Cost categories"
              description="Aggregated from cost_records during the last 31 days."
            >
              {live.categories.length ? (
                <AdminTable
                  caption="Recorded operational cost categories"
                  headers={[
                    "Category",
                    "Spend",
                    "Units",
                    "Unit",
                    "Cost / unit",
                    "Records",
                  ]}
                  rows={live.categories.map((item) => ({
                    id: item.category,
                    cells: [
                      item.category,
                      `$${item.amount.toFixed(2)}`,
                      item.units.toLocaleString(),
                      item.unit || "—",
                      item.units
                        ? `$${(item.amount / item.units).toFixed(4)}`
                        : "—",
                      item.records,
                    ],
                  }))}
                />
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">
                  No cost rows have been recorded in this period.
                </p>
              )}
            </AdminSection>

            <AdminSection
              title="Library and generation efficiency"
              description="Operational reuse facts; no fabricated dollar-savings estimate."
            >
              <div className="space-y-3">
                <Saving
                  icon={<Database className="size-5" />}
                  label="Reusable lessons"
                  value={live.reusableLessons.toLocaleString()}
                />
                <Saving
                  icon={<Sparkles className="size-5" />}
                  label="Generated lessons"
                  value={live.generatedLessons.toLocaleString()}
                />
                <Saving
                  icon={<RefreshCw className="size-5" />}
                  label="Recorded lesson reuses"
                  value={live.reuseCount.toLocaleString()}
                />
                <Saving
                  icon={<HardDrive className="size-5" />}
                  label="Stored media assets"
                  value={live.assets.toLocaleString()}
                />
                <Saving
                  icon={<CircleDollarSign className="size-5" />}
                  label="Cost / successful generation"
                  value={
                    live.successfulJobs
                      ? `$${(live.total / live.successfulJobs).toFixed(2)}`
                      : "—"
                  }
                />
              </div>
              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Vendor invoices and storage byte sizes are not persisted, so this
                dashboard does not invent cloud-storage GB or theoretical
                savings.
              </div>
            </AdminSection>
          </div>

          <div className="mt-6">
            <AdminSection
              title="Daily spend"
              description="Recorded spend by date for the latest 31-day window."
            >
              <DailyRows rows={live.daily} />
            </AdminSection>
          </div>
        </>
      )}
    </>
  );
}

function deriveCosts(data: AdminCostData) {
  const today = new Date().toISOString().slice(0, 10);
  const categories = new Map<
    string,
    {
      category: string;
      amount: number;
      units: number;
      unit: string;
      records: number;
    }
  >();
  const daily = new Map<string, number>();
  for (const record of data.costs) {
    const current = categories.get(record.category) ?? {
      category: record.category,
      amount: 0,
      units: 0,
      unit: record.unit,
      records: 0,
    };
    current.amount += Number(record.amount || 0);
    current.units += Number(record.units || 0);
    current.records += 1;
    if (!current.unit && record.unit) current.unit = record.unit;
    categories.set(record.category, current);
    daily.set(
      record.record_date,
      (daily.get(record.record_date) ?? 0) + Number(record.amount || 0),
    );
  }
  const successfulJobs = data.jobs.filter((job) =>
    ["completed", "generated", "ready", "succeeded", "success"].includes(
      job.status.toLowerCase(),
    ),
  ).length;
  const failedJobs = data.jobs.filter((job) =>
    ["failed", "error"].includes(job.status.toLowerCase()),
  ).length;
  const generationSeconds = data.jobs
    .map((job) => job.generation_seconds)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  return {
    today: data.costs
      .filter((record) => record.record_date === today)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    total: data.costs.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    records: data.costs.length,
    categories: [...categories.values()].sort(
      (left, right) => right.amount - left.amount,
    ),
    daily: [...daily.entries()].sort(([left], [right]) =>
      right.localeCompare(left),
    ),
    jobs: data.jobs.length,
    successfulJobs,
    failedJobs,
    averageGenerationSeconds: average(generationSeconds),
    reusableLessons: data.lessons.filter((lesson) => lesson.reusable).length,
    generatedLessons: data.lessons.filter((lesson) =>
      ["generated", "user_generated", "ai_generated"].includes(lesson.source),
    ).length,
    reuseCount: data.lessons.reduce(
      (sum, lesson) => sum + lesson.usage_count,
      0,
    ),
    assets: data.imageCount + data.audioCount,
  };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10
  );
}

function Saving({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-4">
      <span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
        {icon}
      </span>
      <span className="flex-1 text-sm font-semibold text-slate-600">{label}</span>
      <strong className="text-xl">{value}</strong>
    </div>
  );
}

function DailyRows({ rows }: { rows: Array<[string, number]> }) {
  if (!rows.length) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No recorded spend.
      </p>
    );
  }
  const max = Math.max(...rows.map(([, value]) => value), 1);
  return (
    <div className="space-y-3">
      {rows.map(([date, value]) => (
        <div
          key={date}
          className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="font-medium text-slate-500">{date}</span>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-500"
              style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
            />
          </div>
          <strong>${value.toFixed(2)}</strong>
        </div>
      ))}
    </div>
  );
}
