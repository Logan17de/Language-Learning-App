"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, Search, Sparkles } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { GeneratedValidationStatus } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import {
  adminGeneratedRepository,
  type GeneratedQueueItem,
} from "@/lib/repositories/admin-generated-repository";

export function GeneratedLessonQueue() {
  if (getBackendMode() === "supabase") return <BackendGeneratedQueue />;
  return <DemoGeneratedQueue />;
}

function BackendGeneratedQueue() {
  const [items, setItems] = useState<GeneratedQueueItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const result = await adminGeneratedRepository.list();
    if (result.ok) setItems(result.data);
    else setError(result.error.message);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const statuses = useMemo(() => {
    const values = new Set(items.map((item) => effectiveStatus(item)));
    return ["all", ...Array.from(values).sort()];
  }, [items]);
  const counts = useMemo(() => items.reduce<Record<string, number>>((result, item) => {
    const key = effectiveStatus(item);
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {}), [items]);
  const visible = useMemo(() => items.filter((item) => {
    const haystack = [
      item.request?.topic,
      item.lesson?.title,
      item.lesson?.topic,
      item.requester?.display_name,
      item.requester?.email,
      item.job.id,
      item.lesson?.id,
    ].filter(Boolean).join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || effectiveStatus(item) === status);
  }), [items, query, status]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Live generated content operations"
        title="Generation & validation queue"
        description="Persisted custom-lesson jobs, request context, validation state, generation duration, errors, and publish readiness."
        actions={<Button type="button" variant="secondary" className="rounded-xl" disabled={loading} onClick={() => void load()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>}
      />
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {statuses.filter((item) => item !== "all").slice(0, 6).map((item) => <button key={item} type="button" onClick={() => setStatus(item)} className={`rounded-2xl border bg-white p-4 text-left shadow-sm ${status === item ? "border-teal-400 ring-2 ring-teal-100" : "border-slate-200 hover:border-teal-300"}`}><span className="text-2xl font-bold">{counts[item] ?? 0}</span><span className="mt-1 block text-xs font-bold capitalize text-slate-500">{item.replaceAll("_", " ")}</span></button>)}
      </div>

      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_15rem]">
        <label className="relative"><span className="sr-only">Search generated jobs</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Topic, learner, job or lesson ID" /></label>
        <select aria-label="Generation status" value={status} onChange={(event) => setStatus(event.target.value)} className="admin-input capitalize">{statuses.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : item.replaceAll("_", " ")}</option>)}</select>
      </div>

      {loading && !items.length ? (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading generated jobs" />
      ) : visible.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((item) => {
            const statusValue = effectiveStatus(item);
            const card = (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md">
                <div className="flex items-start gap-4">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${["failed", "error", "rejected"].includes(statusValue) ? "bg-red-50 text-red-700" : "bg-violet-50 text-violet-700"}`}><Sparkles className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="truncate font-bold text-slate-900">{item.lesson?.title || item.request?.topic || `Generation ${item.job.id.slice(0, 8)}`}</h2><AdminStatus>{statusValue}</AdminStatus></div>
                    <p className="mt-1 text-sm text-slate-500">Requested topic: {item.request?.topic || "Unavailable"}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><QueueMetric label="Level" value={item.request?.jlpt_level || item.lesson?.jlpt_level || "—"} /><QueueMetric label="Requester" value={item.requester?.display_name || maskEmail(item.requester?.email || "") || item.job.created_by.slice(0, 8)} /><QueueMetric label="Generation" value={item.job.generation_seconds ? `${item.job.generation_seconds.toFixed(1)}s` : "—"} /><QueueMetric label="Validation" value={item.validation ? `${item.validation.score}/100` : "Not run"} /></div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold"><span className="inline-flex items-center gap-1 text-slate-500"><Clock3 className="size-4" />{new Date(item.job.created_at).toLocaleString()}</span>{item.validation && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" />{item.validation.warnings.length} warnings</span>}{item.job.error_message && <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="size-4" />Generation error</span>}</div>
                    {item.job.error_message && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">{item.job.error_message}</p>}
                    {!item.job.lesson_id && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">No lesson was stored for this job, so there is no lesson-detail page to open.</p>}
                  </div>
                </div>
              </div>
            );
            return item.job.lesson_id ? <Link key={item.job.id} href={`/admin/generated/${item.job.lesson_id}`} className="block">{card}</Link> : <div key={item.job.id}>{card}</div>;
          })}
        </div>
      ) : <AdminEmptyState title="No generated jobs" description="No persisted custom-lesson jobs match the current search and status filter." />}
    </>
  );
}

function effectiveStatus(item: GeneratedQueueItem) {
  return item.lesson?.status || item.validation?.status || item.job.status || "unknown";
}

function maskEmail(email: string) {
  return email ? email.replace(/(^.).+(@.*$)/, "$1•••$2") : "";
}

function DemoGeneratedQueue() {
  const generated = useAppStore((state) => state.generatedLessons);
  const overrides = useAdminStore((state) => state.lessonOverrides);
  const deleted = useAdminStore((state) => state.deletedLessonIds);
  const validations = useAdminStore((state) => state.validations);
  const ensureValidation = useAdminStore((state) => state.ensureValidation);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<GeneratedValidationStatus | "all">("all");
  const lessons = useMemo(() => mergeCanonicalLessons(mockLessons, generated, overrides, deleted).filter((lesson) => lesson.source === "generated" || lesson.source === "user_generated"), [deleted, generated, overrides]);

  useEffect(() => {
    lessons.forEach((lesson) => ensureValidation(lesson));
  }, [ensureValidation, lessons]);

  const visible = lessons.filter((lesson) => {
    const validation = validations[lesson.id];
    return (!query || `${lesson.title} ${lesson.topic}`.toLowerCase().includes(query.toLowerCase())) && (status === "all" || (validation?.status ?? "generated") === status);
  });
  const counts = lessons.reduce<Record<string, number>>((result, lesson) => {
    const key = validations[lesson.id]?.status ?? "generated";
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});

  return (
    <>
      <AdminPageHeader eyebrow="Demo generated content operations" title="Validation queue" description="Local deterministic generated lessons for development without Supabase." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{["generated", "checking", "failed", "needs human review", "approved", "published"].map((item) => <button key={item} type="button" onClick={() => setStatus(item as GeneratedValidationStatus)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-teal-300"><span className="text-2xl font-bold">{counts[item] ?? 0}</span><span className="mt-1 block text-xs font-bold capitalize text-slate-500">{item}</span></button>)}</div>
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_15rem]"><label className="relative"><span className="sr-only">Search generated lessons</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Search topic or lesson" /></label><select aria-label="Validation status" value={status} onChange={(event) => setStatus(event.target.value as GeneratedValidationStatus | "all")} className="admin-input capitalize"><option value="all">All statuses</option>{["generated", "checking", "failed", "needs human review", "approved", "rejected", "published"].map((item) => <option key={item}>{item}</option>)}</select></div>
      {visible.length ? <div className="grid gap-4 xl:grid-cols-2">{visible.map((lesson) => { const validation = validations[lesson.id]; const passed = validation?.checks.filter((check) => check.severity === "passed").length ?? 0; const failed = validation?.checks.filter((check) => check.severity === "failed").length ?? 0; return <Link key={lesson.id} href={`/admin/generated/${lesson.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"><div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Sparkles className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-slate-900">{lesson.title}</h2><AdminStatus>{validation?.status ?? "generated"}</AdminStatus></div><p className="mt-1 text-sm text-slate-500">Requested topic: {validation?.requestedTopic ?? lesson.topic}</p><div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><QueueMetric label="Level" value={lesson.level} /><QueueMetric label="Requester" value={validation?.requester ?? "Learner"} /><QueueMetric label="Generation" value={`${validation?.generationSeconds ?? 0}s`} /><QueueMetric label="Score" value={`${validation?.score ?? 0}/100`} /></div><div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold"><span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" /> {passed} passed</span><span className={failed ? "inline-flex items-center gap-1 text-red-700" : "inline-flex items-center gap-1 text-slate-400"}><AlertTriangle className="size-4" /> {failed} failed</span></div></div></div></Link>; })}</div> : <AdminEmptyState title="No generated lessons" description="New demo-generated lessons will appear here." />}
    </>
  );
}

function QueueMetric({ label, value }: { label: string; value: string }) {
  return <div><span className="block uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block truncate text-slate-700">{value}</strong></div>;
}
