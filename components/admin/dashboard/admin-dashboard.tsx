"use client";

import { useEffect, useMemo, useState } from "react";
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
import { dashboardMetrics } from "@/data/mock-admin";
import { mockLessons } from "@/data/mock-lessons";
import { mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import {
  AdminPageHeader,
  AdminSection,
  AdminStatCard,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import {
  adminDashboardRepository,
  type AdminDashboardData,
} from "@/lib/repositories/admin-dashboard-repository";

export function AdminDashboard() {
  const backendMode = getBackendMode() === "supabase";
  const generated = useAppStore((state) => state.generatedLessons);
  const reports = useAppStore((state) => state.lessonReports);
  const support = useAppStore((state) => state.supportRequests);
  const overrides = useAdminStore((state) => state.lessonOverrides);
  const deleted = useAdminStore((state) => state.deletedLessonIds);
  const validations = useAdminStore((state) => state.validations);
  const stats = useAdminStore((state) => state.lessonStats);
  const audit = useAdminStore((state) => state.auditLog);
  const [live, setLive] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(backendMode);
  const [error, setError] = useState("");

  async function refresh() {
    if (!backendMode) return;
    setLoading(true);
    setError("");
    const result = await adminDashboardRepository.loadDashboard();
    if (result.ok) setLive(result.data);
    else setError(result.error.message);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [backendMode]);

  const demoLessons = useMemo(
    () => mergeCanonicalLessons(mockLessons, generated, overrides, deleted),
    [deleted, generated, overrides],
  );

  const liveMetrics = useMemo(() => {
    if (!live) return null;
    const todayScores = live.completionsToday.map((item) => item.score);
    const averageScore = todayScores.length
      ? Math.round(todayScores.reduce((sum, value) => sum + value, 0) / todayScores.length)
      : 0;
    const monthlyCost = live.costsThisMonth.reduce((sum, item) => sum + Number(item.amount || 0), 0);
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
      estimatedAiCost: monthlyCost,
      storageAssets: live.imageCount + live.audioCount,
      failedGenerationCount: failedJobs,
    };
  }, [live]);

  const demoQueue = demoLessons
    .filter(
      (lesson) =>
        (lesson.source === "generated" || lesson.source === "user_generated") &&
        validations[lesson.id]?.status !== "published",
    )
    .slice(0, 4);

  const demoMetrics = {
    ...dashboardMetrics,
    lessonsPublished: demoLessons.filter((lesson) => lesson.status === "published").length,
    generatedAwaitingValidation: demoQueue.length,
    reportsAwaitingReview: reports.filter(
      (report) =>
        !["fixed", "closed"].includes(
          useAdminStore.getState().reportStates[report.id]?.status ?? "new",
        ),
    ).length,
    openSupportRequests: support.filter(
      (request) =>
        !["resolved", "closed"].includes(
          useAdminStore.getState().supportTickets[request.id]?.status ?? "new",
        ),
    ).length,
    storageAssets: 0,
  };

  const metrics = liveMetrics ?? demoMetrics;
  const conversion = metrics.totalUsers
    ? ((metrics.premiumUsers / metrics.totalUsers) * 100).toFixed(1)
    : "0.0";
  const metricCards = [
    ["Total users", metrics.totalUsers.toLocaleString(), backendMode ? "Registered learner profiles" : "Demo user records", "teal"],
    ["Daily active users", metrics.dailyActiveUsers.toLocaleString(), "Users with activity today", "blue"],
    ["Premium users", metrics.premiumUsers.toLocaleString(), `${conversion}% of registered users`, "orange"],
    ["Published lessons", metrics.lessonsPublished.toLocaleString(), "Learner-visible canonical lessons", "teal"],
    ["Pending validation", metrics.generatedAwaitingValidation.toLocaleString(), "Generated content requiring attention", "orange"],
    ["Open reports", metrics.reportsAwaitingReview.toLocaleString(), "Lesson reports not closed", "red"],
    ["Open support", metrics.openSupportRequests.toLocaleString(), "Support tickets not resolved", "orange"],
    ["Completed today", metrics.lessonsCompletedToday.toLocaleString(), "Lesson completions since UTC midnight", "blue"],
    ["Average score today", `${metrics.averageLessonScore}%`, "Completed lessons today", "teal"],
    [backendMode ? "Recorded cost this month" : "Estimated AI cost", `$${Number(metrics.estimatedAiCost).toFixed(2)}`, backendMode ? "From cost_records" : "Demo operational estimate", "orange"],
    [backendMode ? "Stored media assets" : "Storage usage", backendMode ? metrics.storageAssets.toLocaleString() : `${dashboardMetrics.storageUsageGb} GB`, backendMode ? `${live?.imageCount ?? 0} images · ${live?.audioCount ?? 0} audio` : "Demo media estimate", "blue"],
    ["Recent failed generations", metrics.failedGenerationCount.toLocaleString(), backendMode ? "Among the latest generation jobs" : "Demo last 24 hours", "red"],
  ] as const;

  function exportAnalytics() {
    const payload = {
      exportedAt: new Date().toISOString(),
      source: backendMode ? "supabase" : "demo",
      metrics,
      services: live?.services ?? [],
      jobs: live?.recentJobs ?? [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aiko-admin-overview.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const liveAttention = live?.lessons
    .filter((lesson) => ["needs_review", "rejected"].includes(lesson.status))
    .slice(0, 6) ?? [];
  const failedJobs = live?.recentJobs
    .filter((job) => ["failed", "error"].includes(job.status.toLowerCase()))
    .slice(0, 6) ?? [];

  return (
    <>
      <AdminPageHeader
        eyebrow={backendMode ? "Live operations overview" : "Demo operations overview"}
        title="Admin dashboard"
        description={
          backendMode
            ? "Live learner, content, generation, support, cost, and service-health signals from Supabase."
            : "Local deterministic admin data for development without a configured backend."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {backendMode && (
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
            )}
            <ButtonLink
              href="/admin/lessons/new/edit"
              className="rounded-xl bg-slate-950 hover:bg-slate-800"
            >
              Create lesson
            </ButtonLink>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">
          Live admin telemetry could not be loaded: {error}
        </div>
      )}
      {loading && !live && (
        <div className="mb-5 h-24 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading live admin metrics" />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(([label, value, detail, tone]) => (
          <AdminStatCard key={label} label={label} value={value} detail={detail} tone={tone} />
        ))}
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <AdminSection
          title="Recent activity"
          description={backendMode ? "Latest persisted audit events." : "Local demo audit events."}
        >
          <div className="space-y-1">
            {(backendMode
              ? live?.recentAudit.map((item) => ({
                  id: item.id,
                  title: item.action,
                  detail: `${item.entity_type} · ${item.entity_id}`,
                  time: new Date(item.created_at).toLocaleString(),
                })) ?? []
              : audit.length
                ? audit.slice(0, 8).map((item) => ({
                    id: item.id,
                    title: item.action,
                    detail: item.summary,
                    time: new Date(item.timestamp).toLocaleString(),
                  }))
                : []
            ).map((item) => (
              <div key={item.id} className="flex gap-3 rounded-xl px-2 py-3 hover:bg-slate-50">
                <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                  <Activity className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold capitalize text-slate-800">{item.title.replaceAll("_", " ")}</p>
                  <p className="truncate text-sm text-slate-500">{item.detail}</p>
                </div>
                <time className="whitespace-nowrap text-xs text-slate-400">{item.time}</time>
              </div>
            ))}
            {backendMode && !live?.recentAudit.length && (
              <p className="py-8 text-center text-sm text-slate-500">No audit events have been recorded yet.</p>
            )}
          </div>
        </AdminSection>

        <AdminSection title="Quick actions" description="Common content and operations tasks.">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Create lesson", "/admin/lessons/new/edit"],
              ["Import lesson", "/admin/lessons/import"],
              ["Review generations", "/admin/generated"],
              ["Manage users", "/admin/users"],
              ["View reports", "/admin/reports"],
              ["Support inbox", "/admin/support"],
              ["Inspect costs", "/admin/costs"],
            ].map(([label, href]) => (
              <Link key={label} href={href} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50">
                {label}
                <ArrowRight className="size-4" />
              </Link>
            ))}
            <button type="button" onClick={exportAnalytics} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 px-4 text-left text-sm font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50">
              Export overview
              <Download className="size-4" />
            </button>
          </div>
        </AdminSection>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminSection title="Needs attention" description="Real content and generation failures that should be checked first.">
          <div className="space-y-3">
            {backendMode ? (
              <>
                {liveAttention.map((lesson) => (
                  <Link key={lesson.id} href={`/admin/lessons/${lesson.id}`} className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-4 hover:bg-amber-50">
                    <ShieldAlert className="size-5 shrink-0 text-amber-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{lesson.title}</p>
                      <p className="text-xs text-slate-500">{lesson.jlpt_level} · {lesson.status.replaceAll("_", " ")}</p>
                    </div>
                    <ExternalLink className="size-4 text-slate-400" />
                  </Link>
                ))}
                {failedJobs.map((job) => (
                  <Link key={job.id} href={job.lesson_id ? `/admin/generated/${job.lesson_id}` : "/admin/generated"} className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/50 p-4 hover:bg-red-50">
                    <AlertTriangle className="size-5 shrink-0 text-red-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">Generation failed</p>
                      <p className="truncate text-xs text-red-700">{job.error_message || job.id}</p>
                    </div>
                  </Link>
                ))}
                {!liveAttention.length && !failedJobs.length && (
                  <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800">
                    <CheckCircle2 className="size-5" />
                    <span className="text-sm font-semibold">No recent content or generation failures.</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {stats
                  .filter((item) => item.failureRate >= 20 || item.completionRate < 65 || item.reportCount >= 5)
                  .map((item) => {
                    const lesson = demoLessons.find((candidate) => candidate.id === item.lessonId);
                    return lesson ? (
                      <Link key={item.lessonId} href={`/admin/lessons/${item.lessonId}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 hover:bg-slate-50">
                        <ShieldAlert className="size-5 shrink-0 text-orange-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">{lesson.title}</p>
                          <p className="text-xs text-slate-500">{item.failureRate}% failure · {item.completionRate}% completion · {item.reportCount} reports</p>
                        </div>
                      </Link>
                    ) : null;
                  })}
              </>
            )}
          </div>
        </AdminSection>

        <AdminSection
          title={backendMode ? "Generation pipeline" : "Generated content queue"}
          description={backendMode ? "Latest persisted custom-lesson generation jobs." : "Demo lessons requiring local validation."}
        >
          <div className="space-y-3">
            {backendMode
              ? live?.recentJobs.slice(0, 6).map((job) => (
                  <Link key={job.id} href={job.lesson_id ? `/admin/generated/${job.lesson_id}` : "/admin/generated"} className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 hover:bg-slate-50">
                    <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
                      <Sparkles className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{job.lesson_id ? `Lesson ${job.lesson_id.slice(0, 8)}` : "Generation job"}</p>
                      <p className="text-xs text-slate-500">{new Date(job.created_at).toLocaleString()} · {job.generation_seconds ? `${job.generation_seconds.toFixed(1)}s` : "in progress"}</p>
                    </div>
                    <AdminStatus>{job.status}</AdminStatus>
                  </Link>
                ))
              : demoQueue.map((lesson) => (
                  <Link key={lesson.id} href={`/admin/generated/${lesson.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 hover:bg-slate-50">
                    <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Sparkles className="size-4" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate font-bold">{lesson.title}</p><p className="text-xs text-slate-500">{lesson.topic} · {lesson.level}</p></div>
                    <AdminStatus>{validations[lesson.id]?.status ?? "generated"}</AdminStatus>
                  </Link>
                ))}
            {backendMode && !live?.recentJobs.length && <p className="py-8 text-center text-sm text-slate-500">No generation jobs yet.</p>}
          </div>
        </AdminSection>
      </div>

      {backendMode && (
        <div className="mt-6">
          <AdminSection title="Service health" description="Current status records for AIko's operational dependencies.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(live?.services ?? []).map((service) => {
                const healthy = ["ok", "healthy", "operational", "available"].includes(service.status.toLowerCase());
                return (
                  <div key={service.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-4">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      <ServerCog className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><strong className="truncate">{service.service_name}</strong><AdminStatus>{service.status}</AdminStatus></div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{service.detail || "No status detail provided."}</p>
                    </div>
                  </div>
                );
              })}
              {!live?.services.length && <p className="text-sm text-slate-500">No service-status records are configured.</p>}
            </div>
          </AdminSection>
        </div>
      )}
    </>
  );
}
