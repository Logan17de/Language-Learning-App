"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  AdminPageHeader,
  AdminSection,
  AdminStatCard,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import {
  adminDashboardRepository,
  type AdminDashboardData,
} from "@/lib/repositories/admin-dashboard-repository";

export function AdminDashboard() {
  const [live, setLive] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await adminDashboardRepository.loadDashboard();
    if (result.ok) setLive(result.data);
    else setError(result.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const metrics = useMemo(() => {
    if (!live) return null;
    const todayScores = live.completionsToday.map((item) => item.score);
    const averageScore = todayScores.length
      ? Math.round(
          todayScores.reduce((sum, value) => sum + value, 0) /
            todayScores.length,
        )
      : 0;
    const monthlyCost = live.costsThisMonth.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const failedJobs = live.recentJobs.filter((job) =>
      ["failed", "error"].includes(job.status.toLowerCase()),
    ).length;
    return {
      totalUsers: live.summary.total_users,
      dailyActiveUsers: live.summary.daily_active_users,
      premiumUsers: live.summary.premium_users,
      lessonsPublished: live.summary.published_lessons,
      generatedAwaitingValidation: live.summary.pending_validations,
      reportsAwaitingReview: live.summary.open_reports,
      openSupportRequests: live.summary.open_support_tickets,
      lessonsCompletedToday: live.completionsToday.length,
      averageLessonScore: averageScore,
      recordedAiCost: monthlyCost,
      storageAssets: live.imageCount + live.audioCount,
      failedGenerationCount: failedJobs,
    };
  }, [live]);

  const conversion = metrics?.totalUsers
    ? ((metrics.premiumUsers / metrics.totalUsers) * 100).toFixed(1)
    : "0.0";
  const metricCards = metrics
    ? ([
        ["Total users", metrics.totalUsers.toLocaleString(), "Registered learner profiles", "teal"],
        ["Daily active users", metrics.dailyActiveUsers.toLocaleString(), "Users with activity today", "blue"],
        ["Premium users", metrics.premiumUsers.toLocaleString(), `${conversion}% of registered users`, "orange"],
        ["Published lessons", metrics.lessonsPublished.toLocaleString(), "Learner-visible canonical lessons", "teal"],
        ["Pending validation", metrics.generatedAwaitingValidation.toLocaleString(), "Generated content requiring attention", "orange"],
        ["Open reports", metrics.reportsAwaitingReview.toLocaleString(), "Lesson reports not closed", "red"],
        ["Open support", metrics.openSupportRequests.toLocaleString(), "Support tickets not resolved", "orange"],
        ["Completed today", metrics.lessonsCompletedToday.toLocaleString(), "Lesson completions since UTC midnight", "blue"],
        ["Average score today", `${metrics.averageLessonScore}%`, "Completed lessons today", "teal"],
        ["Recorded cost this month", `$${metrics.recordedAiCost.toFixed(2)}`, "From cost records", "orange"],
        ["Stored media assets", metrics.storageAssets.toLocaleString(), `${live?.imageCount ?? 0} images · ${live?.audioCount ?? 0} audio`, "blue"],
        ["Recent failed generations", metrics.failedGenerationCount.toLocaleString(), "Among the latest generation jobs", "red"],
      ] as const)
    : [];

  function exportAnalytics() {
    if (!live || !metrics) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            source: "supabase",
            metrics,
            services: live.services,
            jobs: live.recentJobs,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aiko-admin-overview.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const attention =
    live?.lessons
      .filter((lesson) => ["needs_review", "rejected"].includes(lesson.status))
      .slice(0, 6) ?? [];
  const failedJobs =
    live?.recentJobs
      .filter((job) => ["failed", "error"].includes(job.status.toLowerCase()))
      .slice(0, 6) ?? [];

  return (
    <>
      <AdminPageHeader
        eyebrow="Live operations overview"
        title="Admin dashboard"
        description="Live learner, content, generation, support, cost, and service-health signals from Supabase."
        actions={
          <Button
            type="button"
            variant="secondary"
            className="rounded-xl"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800"
        >
          Live admin telemetry could not be loaded: {error}
        </div>
      )}
      {loading && !live && (
        <div
          className="mb-5 h-24 animate-pulse rounded-2xl bg-slate-100"
          aria-label="Loading live admin metrics"
        />
      )}

      {metrics && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map(([label, value, detail, tone]) => (
            <AdminStatCard
              key={label}
              label={label}
              value={value}
              detail={detail}
              tone={tone}
            />
          ))}
        </div>
      )}

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <AdminSection title="Recent activity" description="Latest persisted audit events.">
          <div className="space-y-1">
            {(live?.recentAudit ?? []).map((item) => (
              <div
                key={item.id}
                className="flex gap-3 rounded-xl px-2 py-3 hover:bg-slate-50"
              >
                <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                  <Activity className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold capitalize text-slate-800">
                    {item.action.replaceAll("_", " ")}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {item.entity_type} · {item.entity_id}
                  </p>
                </div>
                <time className="whitespace-nowrap text-xs text-slate-400">
                  {new Date(item.created_at).toLocaleString()}
                </time>
              </div>
            ))}
            {!loading && !live?.recentAudit.length && (
              <p className="py-8 text-center text-sm text-slate-500">
                No audit events have been recorded yet.
              </p>
            )}
          </div>
        </AdminSection>

        <AdminSection title="Quick actions" description="Production-backed content and operations tasks.">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Import lesson", "/admin/lessons/import"],
              ["Batch generate", "/admin/lessons/batch-generate"],
              ["Review generations", "/admin/generated"],
              ["Manage users", "/admin/users"],
              ["View reports", "/admin/reports"],
              ["Support inbox", "/admin/support"],
              ["Inspect costs", "/admin/costs"],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50"
              >
                {label}
                <ArrowRight className="size-4" />
              </Link>
            ))}
            <button
              type="button"
              disabled={!live}
              onClick={exportAnalytics}
              className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 px-4 text-left text-sm font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export overview
              <Download className="size-4" />
            </button>
          </div>
        </AdminSection>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminSection
          title="Needs attention"
          description="Real content and generation failures that should be checked first."
        >
          <div className="space-y-3">
            {attention.map((lesson) => (
              <Link
                key={lesson.id}
                href={`/admin/lessons/${lesson.id}`}
                className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-4 hover:bg-amber-50"
              >
                <ShieldAlert className="size-5 shrink-0 text-amber-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{lesson.title}</p>
                  <p className="text-xs text-slate-500">
                    {lesson.jlpt_level} · {lesson.status.replaceAll("_", " ")}
                  </p>
                </div>
                <ExternalLink className="size-4 text-slate-400" />
              </Link>
            ))}
            {failedJobs.map((job) => (
              <Link
                key={job.id}
                href={job.lesson_id ? `/admin/generated/${job.lesson_id}` : "/admin/generated"}
                className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/50 p-4 hover:bg-red-50"
              >
                <AlertTriangle className="size-5 shrink-0 text-red-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">Generation failed</p>
                  <p className="truncate text-xs text-red-700">
                    {job.error_message || job.id}
                  </p>
                </div>
              </Link>
            ))}
            {!loading && !attention.length && !failedJobs.length && (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
                <CheckCircle2 className="size-5" />
                <span className="text-sm font-semibold">
                  No recent content or generation failures.
                </span>
              </div>
            )}
          </div>
        </AdminSection>

        <AdminSection title="Generation pipeline" description="Latest persisted custom-lesson generation jobs.">
          <div className="space-y-3">
            {(live?.recentJobs ?? []).slice(0, 6).map((job) => (
              <Link
                key={job.id}
                href={job.lesson_id ? `/admin/generated/${job.lesson_id}` : "/admin/generated"}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 hover:bg-slate-50"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
                  <Sparkles className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {job.lesson_id ? `Lesson ${job.lesson_id.slice(0, 8)}` : "Generation job"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(job.created_at).toLocaleString()} ·{" "}
                    {job.generation_seconds ? `${job.generation_seconds.toFixed(1)}s` : "in progress"}
                  </p>
                </div>
                <AdminStatus>{job.status}</AdminStatus>
              </Link>
            ))}
            {!loading && !live?.recentJobs.length && (
              <p className="py-8 text-center text-sm text-slate-500">
                No generation jobs yet.
              </p>
            )}
          </div>
        </AdminSection>
      </div>

      <div className="mt-6">
        <AdminSection
          title="Service health"
          description="Current status records for AIko's operational dependencies."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(live?.services ?? []).map((service) => {
              const healthy = ["ok", "healthy", "operational", "available"].includes(
                service.status.toLowerCase(),
              );
              return (
                <div
                  key={service.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-100 p-4"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                      healthy
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    <ServerCog className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate">{service.service_name}</strong>
                      <AdminStatus>{service.status}</AdminStatus>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {service.detail || "No status detail provided."}
                    </p>
                  </div>
                </div>
              );
            })}
            {!loading && !live?.services.length && (
              <p className="text-sm text-slate-500">
                No service-status records are configured.
              </p>
            )}
          </div>
        </AdminSection>
      </div>
    </>
  );
}
