"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Search, Sparkles } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { GeneratedValidationStatus } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/admin-primitives";

export function GeneratedLessonQueue() {
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
      <AdminPageHeader eyebrow="Generated content operations" title="Validation queue" description="Inspect schema, curriculum, content alignment, question quality, language, safety, and publishing readiness before learner distribution." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{["generated", "checking", "failed", "needs human review", "approved", "published"].map((item) => <button key={item} type="button" onClick={() => setStatus(item as GeneratedValidationStatus)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-teal-300"><span className="text-2xl font-bold">{counts[item] ?? 0}</span><span className="mt-1 block text-xs font-bold capitalize text-slate-500">{item}</span></button>)}</div>
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_15rem]">
        <label className="relative"><span className="sr-only">Search generated lessons</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" placeholder="Search topic or lesson" /></label>
        <select aria-label="Validation status" value={status} onChange={(event) => setStatus(event.target.value as GeneratedValidationStatus | "all")} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm capitalize outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"><option value="all">All statuses</option>{["generated", "checking", "failed", "needs human review", "approved", "rejected", "published"].map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      {visible.length ? <div className="grid gap-4 xl:grid-cols-2">{visible.map((lesson) => {
        const validation = validations[lesson.id];
        const passed = validation?.checks.filter((check) => check.severity === "passed").length ?? 0;
        const failed = validation?.checks.filter((check) => check.severity === "failed").length ?? 0;
        return <Link key={lesson.id} href={`/admin/generated/${lesson.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"><div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Sparkles className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-slate-900">{lesson.title}</h2><AdminStatus>{validation?.status ?? "generated"}</AdminStatus></div><p className="mt-1 text-sm text-slate-500">Requested topic: {validation?.requestedTopic ?? lesson.topic}</p><div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><QueueMetric label="Level" value={lesson.level} /><QueueMetric label="Requester" value={validation?.requester ?? "Learner"} /><QueueMetric label="Generation" value={`${validation?.generationSeconds ?? 0}s`} /><QueueMetric label="Score" value={`${validation?.score ?? 0}/100`} /></div><div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold"><span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" /> {passed} passed</span><span className={failed ? "inline-flex items-center gap-1 text-red-700" : "inline-flex items-center gap-1 text-slate-400"}><AlertTriangle className="size-4" /> {failed} failed</span><span className="inline-flex items-center gap-1 text-slate-500"><Clock3 className="size-4" /> {validation?.generatedAt ?? "Just now"}</span></div>{validation?.warnings.length ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{validation.warnings[0]}</p> : null}</div></div></Link>;
      })}</div> : <AdminEmptyState title="No generated lessons" description="New learner-generated lessons will appear here automatically for deterministic validation." />}
    </>
  );
}

function QueueMetric({ label, value }: { label: string; value: string }) {
  return <div><span className="block uppercase tracking-wider text-slate-400">{label}</span><strong className="mt-1 block truncate text-slate-700">{value}</strong></div>;
}
