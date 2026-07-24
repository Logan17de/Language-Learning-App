"use client";

import Link from "next/link";
import { Activity, ArrowRight, Download, ExternalLink, ShieldAlert, Sparkles } from "lucide-react";
import { dashboardMetrics } from "@/data/mock-admin";
import { mockLessons } from "@/data/mock-lessons";
import { mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import { AdminPageHeader, AdminSection, AdminStatCard, AdminStatus } from "@/components/admin/admin-primitives";
import { ButtonLink } from "@/components/ui/button";

export function AdminDashboard() {
  const generated = useAppStore((state) => state.generatedLessons);
  const reports = useAppStore((state) => state.lessonReports);
  const support = useAppStore((state) => state.supportRequests);
  const overrides = useAdminStore((state) => state.lessonOverrides);
  const deleted = useAdminStore((state) => state.deletedLessonIds);
  const validations = useAdminStore((state) => state.validations);
  const stats = useAdminStore((state) => state.lessonStats);
  const audit = useAdminStore((state) => state.auditLog);
  const lessons = mergeCanonicalLessons(mockLessons, generated, overrides, deleted);
  const queue = lessons.filter((lesson) => (lesson.source === "generated" || lesson.source === "user_generated") && validations[lesson.id]?.status !== "published").slice(0, 4);
  const metrics = {
    ...dashboardMetrics,
    lessonsPublished: lessons.filter((lesson) => lesson.status === "published").length,
    generatedAwaitingValidation: queue.length,
    reportsAwaitingReview: reports.filter((report) => !["fixed", "closed"].includes(useAdminStore.getState().reportStates[report.id]?.status ?? "new")).length,
    openSupportRequests: support.filter((request) => !["resolved", "closed"].includes(useAdminStore.getState().supportTickets[request.id]?.status ?? "new")).length,
  };
  const metricCards = [
    ["Total users", metrics.totalUsers.toLocaleString(), "All deterministic user records", "teal"],
    ["Daily active users", metrics.dailyActiveUsers, "6.9% of monthly active", "blue"],
    ["Premium users", metrics.premiumUsers, "7.8% conversion", "orange"],
    ["Lessons published", metrics.lessonsPublished, "Canonical learner-visible content", "teal"],
    ["Generated awaiting review", metrics.generatedAwaitingValidation, "Human validation queue", "orange"],
    ["Reports awaiting review", metrics.reportsAwaitingReview, "Synced from learner reports", "red"],
    ["Open support requests", metrics.openSupportRequests, "Synced from learner support", "orange"],
    ["Lessons completed today", metrics.lessonsCompletedToday.toLocaleString(), "Across all mock learners", "blue"],
    ["Average lesson score", `${metrics.averageLessonScore}%`, "All levels", "teal"],
    ["Estimated AI cost", `$${metrics.estimatedAiCost}`, "Mock daily operational cost", "orange"],
    ["Storage usage", `${metrics.storageUsageGb} GB`, "Images, audio, and exports", "blue"],
    ["Failed generations", metrics.failedGenerationCount, "Last 24 hours", "red"],
  ] as const;

  function exportAnalytics() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), metrics }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aiko-admin-analytics.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <AdminPageHeader eyebrow="Operations overview" title="Admin dashboard" description="A deterministic snapshot of content quality, learner operations, and the library-first generation model." actions={<ButtonLink href="/admin/lessons/new/edit" className="rounded-xl bg-slate-950 hover:bg-slate-800">Create lesson</ButtonLink>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(([label, value, detail, tone]) => <AdminStatCard key={label} label={label} value={value} detail={detail} tone={tone} />)}</div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <AdminSection title="Recent activity" description="Central audit entries plus deterministic operational events.">
          <div className="space-y-1">
            {(audit.length ? audit.slice(0, 6).map((item) => ({ id: item.id, title: item.action, detail: item.summary, time: new Date(item.timestamp).toLocaleString() })) : [
              { id: "activity_1", title: "New user", detail: "Liam completed N5 onboarding.", time: "8 minutes ago" },
              { id: "activity_2", title: "Lesson published", detail: "Your First Train Transfer was published.", time: "32 minutes ago" },
              { id: "activity_3", title: "Generated lesson submitted", detail: "Welcoming a Business Visitor entered validation.", time: "48 minutes ago" },
              { id: "activity_4", title: "Subscription changed", detail: "Mika S. selected annual Premium.", time: "1 hour ago" },
              { id: "activity_5", title: "Support request opened", detail: "A learner requested billing help.", time: "2 hours ago" },
            ]).map((item) => <div key={item.id} className="flex gap-3 rounded-xl px-2 py-3 hover:bg-slate-50"><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700"><Activity className="size-4" /></span><div className="min-w-0 flex-1"><p className="font-semibold capitalize text-slate-800">{item.title}</p><p className="truncate text-sm text-slate-500">{item.detail}</p></div><time className="whitespace-nowrap text-xs text-slate-400">{item.time}</time></div>)}
          </div>
        </AdminSection>
        <AdminSection title="Quick actions" description="Common content and operations tasks.">
          <div className="grid gap-3 sm:grid-cols-2">
            {[["Create lesson", "/admin/lessons/new/edit"], ["Review generated", "/admin/generated"], ["Add grammar point", "/admin/grammar?new=1"], ["Upload image placeholder", "/admin/images?new=1"], ["View reports", "/admin/reports"]].map(([label, href]) => <Link key={label} href={href} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50">{label}<ArrowRight className="size-4" /></Link>)}
            <button type="button" onClick={exportAnalytics} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 px-4 text-left text-sm font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50">Export analytics<Download className="size-4" /></button>
          </div>
        </AdminSection>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminSection title="Content health" description="Lessons requiring operational attention.">
          <div className="space-y-3">
            {stats.filter((item) => item.failureRate >= 20 || item.completionRate < 65 || item.reportCount >= 5).map((item) => {
              const lesson = lessons.find((candidate) => candidate.id === item.lessonId);
              return lesson ? <Link key={item.lessonId} href={`/admin/lessons/${item.lessonId}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 hover:bg-slate-50"><ShieldAlert className="size-5 shrink-0 text-orange-600" /><div className="min-w-0 flex-1"><p className="truncate font-bold">{lesson.title}</p><p className="text-xs text-slate-500">{item.failureRate}% failure · {item.completionRate}% completion · {item.reportCount} reports</p></div><ExternalLink className="size-4 text-slate-400" /></Link> : null;
            })}
            {lessons.filter((lesson) => lesson.status === "malformed" || !lesson.images.length || !lesson.listeningExercises.length).map((lesson) => <Link key={lesson.id} href={`/admin/lessons/${lesson.id}`} className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50/50 p-4"><ShieldAlert className="size-5 text-red-600" /><div><p className="font-bold">{lesson.title}</p><p className="text-xs text-red-700">Malformed package or missing lesson assets</p></div></Link>)}
          </div>
        </AdminSection>
        <AdminSection title="Generated content queue" description="Latest generated lessons requiring human validation.">
          <div className="space-y-3">
            {queue.map((lesson) => <Link key={lesson.id} href={`/admin/generated/${lesson.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 hover:bg-slate-50"><span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><Sparkles className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-bold">{lesson.title}</p><p className="text-xs text-slate-500">{lesson.topic} · {lesson.level}</p></div><AdminStatus>{validations[lesson.id]?.status ?? "generated"}</AdminStatus></Link>)}
            {!queue.length && <p className="py-8 text-center text-sm text-slate-500">No generated lessons are waiting.</p>}
          </div>
        </AdminSection>
      </div>
    </>
  );
}
