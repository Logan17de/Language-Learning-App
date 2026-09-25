"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { analyticsSnapshot } from "@/data/mock-admin";
import {
  AdminPageHeader,
  AdminSection,
  AdminStatCard,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import {
  adminDashboardRepository,
  type AdminAnalyticsData,
} from "@/lib/repositories/admin-dashboard-repository";

export function AnalyticsDashboard() {
  const backendMode = getBackendMode() === "supabase";
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(backendMode);
  const [error, setError] = useState("");

  async function refresh() {
    if (!backendMode) return;
    setLoading(true);
    setError("");
    const result = await adminDashboardRepository.loadAnalytics(30);
    if (result.ok) setData(result.data);
    else setError(result.error.message);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [backendMode]);

  const live = useMemo(() => (data ? deriveAnalytics(data) : null), [data]);

  if (!backendMode) {
    const usageEntries = Object.entries(analyticsSnapshot.usage);
    return (
      <>
        <AdminPageHeader eyebrow="Demo product intelligence" title="Analytics" description={`Deterministic local analytics captured ${analyticsSnapshot.capturedAt}. Configure Supabase to see real product telemetry.`} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{usageEntries.slice(0, 4).map(([label, value], index) => <AdminStatCard key={label} label={label} value={value.toLocaleString()} tone={index === 1 ? "blue" : index === 2 ? "orange" : "teal"} />)}</div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <AdminSection title="Daily active users" description="Seven-day demo trend."><BarChart data={analyticsSnapshot.dailySeries} suffix="" /></AdminSection>
          <AdminSection title="Retention cohorts" description="Demo Day-30 retention."><BarChart data={analyticsSnapshot.cohortSeries} suffix="%" /></AdminSection>
          <MetricSection title="Usage" data={analyticsSnapshot.usage} />
          <MetricSection title="Retention" data={analyticsSnapshot.retention} percent />
          <MetricSection title="Learning" data={analyticsSnapshot.learning} percent />
          <MetricSection title="Content" data={analyticsSnapshot.content} />
          <MetricSection title="Conversion" data={analyticsSnapshot.conversion} percent />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Live product intelligence"
        title="Analytics"
        description="Thirty-day learner activity, learning outcomes, content operations, generation quality, and subscription conversion from Supabase."
        actions={<Button type="button" variant="secondary" className="rounded-xl" disabled={loading} onClick={() => void refresh()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>}
      />
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {!live ? (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading analytics" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard label="Registered users" value={live.totalUsers.toLocaleString()} detail={`${live.newUsers} joined in the last 30 days`} />
            <AdminStatCard label="30-day active users" value={live.active30.toLocaleString()} detail={`${live.activeRate}% of registered users`} tone="blue" />
            <AdminStatCard label="Premium users" value={live.premiumUsers.toLocaleString()} detail={`${live.premiumConversion}% conversion`} tone="orange" />
            <AdminStatCard label="Study minutes" value={live.studyMinutes.toLocaleString()} detail="Recorded in the last 30 days" />
            <AdminStatCard label="Lesson completions" value={live.lessonCompletions.toLocaleString()} detail={`${live.averageLessonScore}% average score`} tone="teal" />
            <AdminStatCard label="Review sessions" value={live.reviewSessions.toLocaleString()} detail={`${live.averageReviewScore}% average score`} tone="blue" />
            <AdminStatCard label="Custom requests" value={live.customRequests.toLocaleString()} detail={`${live.generationSuccessRate}% generation success`} tone="orange" />
            <AdminStatCard label="Recorded cost" value={`$${live.recordedCost.toFixed(2)}`} detail="Cost rows in the last 30 days" tone="red" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <AdminSection title="Daily active users" description="Unique users with recorded activity during the last seven days.">
              <BarChart data={live.dailyActiveSeries} suffix="" />
            </AdminSection>
            <AdminSection title="Daily study minutes" description="Total recorded lesson + review study time during the last seven days.">
              <BarChart data={live.dailyMinutesSeries} suffix="m" />
            </AdminSection>

            <AdminSection title="Learning outcomes">
              <div className="grid gap-3 sm:grid-cols-2">
                <Kpi label="Average lesson score" value={`${live.averageLessonScore}%`} />
                <Kpi label="Average lesson duration" value={`${live.averageLessonDuration} min`} />
                <Kpi label="Average review score" value={`${live.averageReviewScore}%`} />
                <Kpi label="Review answer accuracy" value={`${live.reviewAccuracy}%`} />
              </div>
            </AdminSection>

            <AdminSection title="Generation operations">
              <div className="grid gap-3 sm:grid-cols-2">
                <Kpi label="Jobs started" value={live.generationJobs.toLocaleString()} />
                <Kpi label="Jobs failed" value={live.failedJobs.toLocaleString()} tone={live.failedJobs ? "red" : "default"} />
                <Kpi label="Success rate" value={`${live.generationSuccessRate}%`} />
                <Kpi label="Average generation time" value={`${live.averageGenerationSeconds}s`} />
              </div>
            </AdminSection>

            <AdminSection title="Content library">
              <div className="grid gap-3 sm:grid-cols-2">
                <Kpi label="All lessons" value={live.totalLessons.toLocaleString()} />
                <Kpi label="Published" value={live.publishedLessons.toLocaleString()} />
                <Kpi label="Reusable lessons" value={live.reusableLessons.toLocaleString()} />
                <Kpi label="Recorded lesson reuses" value={live.lessonReuseCount.toLocaleString()} />
              </div>
              <div className="mt-5 space-y-3">
                {live.levelDistribution.map((item) => <Progress key={item.label} label={`${item.label} learners`} value={item.percent} count={item.count} />)}
              </div>
            </AdminSection>

            <AdminSection title="Validation quality">
              <div className="grid gap-3 sm:grid-cols-2">
                <Kpi label="Validation runs" value={live.validationRuns.toLocaleString()} />
                <Kpi label="Average validation score" value={`${live.averageValidationScore}/100`} />
                <Kpi label="Runs with warnings" value={live.warningRuns.toLocaleString()} tone={live.warningRuns ? "amber" : "default"} />
                <Kpi label="Pending / checking" value={live.pendingValidationRuns.toLocaleString()} />
              </div>
            </AdminSection>

            <AdminSection title="Subscription mix">
              <div className="space-y-3">
                {live.subscriptionMix.map((item) => <Progress key={item.label} label={item.label} value={item.percent} count={item.count} />)}
              </div>
            </AdminSection>

            <AdminSection title="Operational truth" description="Metrics we intentionally do not invent.">
              <div className="space-y-3 text-sm leading-6 text-slate-600">
                <p><AdminStatus>not estimated</AdminStatus> True cohort retention is not shown because AIko does not yet persist a dedicated acquisition/cohort fact table.</p>
                <p><AdminStatus>not estimated</AdminStatus> Storage size in GB is not shown because asset byte sizes are not stored in the current schema.</p>
                <p><AdminStatus>live</AdminStatus> Every number above is calculated from persisted profiles, activity, completions, reviews, lessons, generation jobs, validation runs, or cost records.</p>
              </div>
            </AdminSection>
          </div>
        </>
      )}
    </>
  );
}

function deriveAnalytics(data: AdminAnalyticsData) {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86_400_000;
  const premiumUsers = data.profiles.filter((item) => item.subscription_plan !== "free").length;
  const newUsers = data.profiles.filter((item) => Date.parse(item.created_at) >= thirtyDaysAgo).length;
  const activeIds = new Set(data.activity.filter((item) => item.minutes > 0).map((item) => item.user_id));
  const studyMinutes = data.activity.reduce((sum, item) => sum + item.minutes, 0);
  const averageLessonScore = average(data.completions.map((item) => item.score));
  const averageLessonDuration = average(data.completions.map((item) => item.duration_minutes));
  const averageReviewScore = average(data.reviews.map((item) => item.score));
  const totalReviewAnswers = data.reviews.reduce((sum, item) => sum + item.total_count, 0);
  const correctReviewAnswers = data.reviews.reduce((sum, item) => sum + item.correct_count, 0);
  const successfulJobs = data.jobs.filter((item) => ["completed", "generated", "ready", "succeeded", "success"].includes(item.status.toLowerCase())).length;
  const failedJobs = data.jobs.filter((item) => ["failed", "error"].includes(item.status.toLowerCase())).length;
  const finishedJobs = successfulJobs + failedJobs;
  const finishedGenerationSeconds = data.jobs.map((item) => item.generation_seconds).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const publishedLessons = data.lessons.filter((item) => item.status === "published").length;
  const reusableLessons = data.lessons.filter((item) => item.reusable).length;
  const lessonReuseCount = data.lessons.reduce((sum, item) => sum + item.usage_count, 0);
  const validationRuns = data.validations.length;
  const warningRuns = data.validations.filter((item) => item.warnings.length > 0).length;
  const pendingValidationRuns = data.validations.filter((item) => ["generated", "checking", "needs_review", "validation_pending", "pending"].includes(item.status.toLowerCase())).length;

  const levels = ["N5", "N4", "N3", "N2", "N1"] as const;
  const levelDistribution = levels.map((level) => {
    const count = data.profiles.filter((item) => item.current_jlpt_level === level).length;
    return { label: level, count, percent: percent(count, data.profiles.length) };
  });
  const plans = [
    ["Free", data.profiles.filter((item) => item.subscription_plan === "free").length],
    ["Premium monthly", data.profiles.filter((item) => item.subscription_plan === "premium_monthly").length],
    ["Premium annual", data.profiles.filter((item) => item.subscription_plan === "premium_annual").length],
  ] as const;
  const subscriptionMix = plans.map(([label, count]) => ({ label, count, percent: percent(count, data.profiles.length) }));

  return {
    totalUsers: data.profiles.length,
    newUsers,
    active30: activeIds.size,
    activeRate: percent(activeIds.size, data.profiles.length),
    premiumUsers,
    premiumConversion: percent(premiumUsers, data.profiles.length),
    studyMinutes,
    lessonCompletions: data.completions.length,
    averageLessonScore,
    averageLessonDuration,
    reviewSessions: data.reviews.length,
    averageReviewScore,
    reviewAccuracy: percent(correctReviewAnswers, totalReviewAnswers),
    customRequests: data.requests.length,
    generationJobs: data.jobs.length,
    successfulJobs,
    failedJobs,
    generationSuccessRate: percent(successfulJobs, finishedJobs),
    averageGenerationSeconds: average(finishedGenerationSeconds),
    totalLessons: data.lessons.length,
    publishedLessons,
    reusableLessons,
    lessonReuseCount,
    validationRuns,
    averageValidationScore: average(data.validations.map((item) => item.score)),
    warningRuns,
    pendingValidationRuns,
    recordedCost: data.costs.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    dailyActiveSeries: lastSevenDays().map((day) => ({
      label: day.label,
      value: new Set(data.activity.filter((item) => item.activity_date === day.date && item.minutes > 0).map((item) => item.user_id)).size,
    })),
    dailyMinutesSeries: lastSevenDays().map((day) => ({
      label: day.label,
      value: data.activity.filter((item) => item.activity_date === day.date).reduce((sum, item) => sum + item.minutes, 0),
    })),
    levelDistribution,
    subscriptionMix,
  };
}

function lastSevenDays() {
  const result: Array<{ date: string; label: string }> = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    const iso = date.toISOString().slice(0, 10);
    result.push({ date: iso, label: date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }) });
  }
  return result;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function MetricSection({ title, data, percent: showPercent = false }: { title: string; data: Record<string, number>; percent?: boolean }) {
  return <AdminSection title={title}><div className="grid gap-3 sm:grid-cols-2">{Object.entries(data).map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><span className="text-xs font-semibold text-slate-500">{label}</span><strong className="mt-1 block text-2xl text-slate-900">{value.toLocaleString()}{showPercent ? "%" : ""}</strong></div>)}</div></AdminSection>;
}

function BarChart({ data, suffix }: { data: Array<{ label: string; value: number }>; suffix: string }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return <div className="flex h-56 items-end gap-3" role="img" aria-label={data.map((item) => `${item.label}: ${item.value}${suffix}`).join(", ")}>{data.map((item) => <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center"><span className="mb-2 text-xs font-bold text-slate-600">{item.value}{suffix}</span><div className="mx-auto w-full max-w-12 rounded-t-lg bg-teal-500" style={{ height: `${Math.max(8, (item.value / max) * 78)}%` }} /><span className="mt-2 text-xs text-slate-500">{item.label}</span></div>)}</div>;
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "red" | "amber" }) {
  return <div className={`rounded-xl p-4 ${tone === "red" ? "bg-red-50" : tone === "amber" ? "bg-amber-50" : "bg-slate-50"}`}><span className="text-xs font-semibold text-slate-500">{label}</span><strong className={`mt-1 block text-2xl ${tone === "red" ? "text-red-800" : tone === "amber" ? "text-amber-800" : "text-slate-900"}`}>{value}</strong></div>;
}

function Progress({ label, value, count }: { label: string; value: number; count?: number }) {
  return <div><div className="mb-1 flex justify-between gap-3 text-sm"><span>{label}</span><strong>{typeof count === "number" ? `${count} · ` : ""}{value}%</strong></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>;
}
