"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, RefreshCw, Send, ShieldAlert, Sparkles, X } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { GeneratedValidationStatus, ValidationCategory } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminSection, AdminStatus } from "@/components/admin/admin-primitives";
import { Button, ButtonLink } from "@/components/ui/button";

const sections = ["story", "vocabulary", "grammar", "reading", "listening", "speaking", "review", "images"];
const categories: ValidationCategory[] = ["Schema", "Curriculum", "Content alignment", "Question quality", "Language quality", "Safety and quality"];

export function GeneratedValidationDetail({ lessonId }: { lessonId: string }) {
  const generated = useAppStore((state) => state.generatedLessons);
  const overrides = useAdminStore((state) => state.lessonOverrides);
  const deleted = useAdminStore((state) => state.deletedLessonIds);
  const validation = useAdminStore((state) => state.validations[lessonId]);
  const ensureValidation = useAdminStore((state) => state.ensureValidation);
  const setStatus = useAdminStore((state) => state.setValidationStatus);
  const regenerate = useAdminStore((state) => state.regenerateLessonSection);
  const [section, setSection] = useState("story");
  const [message, setMessage] = useState("");
  const lesson = useMemo(() => mergeCanonicalLessons(mockLessons, generated, overrides, deleted).find((item) => item.id === lessonId), [deleted, generated, lessonId, overrides]);

  useEffect(() => {
    if (lesson) ensureValidation(lesson);
  }, [ensureValidation, lesson]);

  if (!lesson) return <AdminEmptyState title="Generated lesson not found" description="The generated entity ID is invalid or has been removed." />;
  if (!validation) return <div className="h-72 animate-pulse rounded-2xl bg-slate-100" aria-label="Preparing validation" />;

  function action(status: GeneratedValidationStatus, note: string) {
    setStatus(lessonId, status, note);
    setMessage(note);
  }

  return (
    <>
      <AdminPageHeader eyebrow="Generated lesson validation" title={lesson.title} description={`${lesson.id} · requested by ${validation.requester} for ${validation.requestedTopic}`} actions={<div className="flex gap-2"><ButtonLink href={`/admin/lessons/${lesson.id}/edit`} variant="secondary" className="rounded-xl">Edit lesson</ButtonLink><ButtonLink href={`/lesson/${lesson.id}/preview`} variant="secondary" className="rounded-xl">Learner preview</ButtonLink></div>} />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Validation score</p><p className="mt-2 text-4xl font-black">{validation.score}<span className="text-lg text-slate-400">/100</span></p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Current status</p><div className="mt-3"><AdminStatus>{validation.status}</AdminStatus></div><p className="mt-3 text-xs text-slate-500">Generated in {validation.generationSeconds} seconds</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Warnings</p><p className="mt-2 text-3xl font-black">{validation.warnings.length}</p><p className="mt-2 text-xs text-slate-500">{validation.warnings[0] ?? "No outstanding warnings."}</p></div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {categories.map((category) => <AdminSection key={category} title={category}>{validation.checks.filter((check) => check.category === category).map((check) => <div key={check.id} className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0"><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${check.severity === "passed" ? "bg-emerald-50 text-emerald-700" : check.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{check.severity === "passed" ? <Check className="size-4" /> : check.severity === "warning" ? <ShieldAlert className="size-4" /> : <X className="size-4" />}</span><div className="flex-1"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{check.label}</strong><AdminStatus>{check.severity}</AdminStatus></div><p className="mt-1 text-sm text-slate-500">{check.detail}</p></div></div>)}</AdminSection>)}
          <AdminSection title="Validation history" description="Stored deterministic checks and human decisions."><div className="space-y-3">{validation.history.map((item) => <div key={item.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{item.admin}</strong><AdminStatus>{item.outcome}</AdminStatus></div><p className="mt-2 text-sm text-slate-600">{item.note}</p><p className="mt-2 text-xs text-slate-400">{item.timestamp} · score {item.score}</p></div>)}</div></AdminSection>
        </div>
        <aside className="space-y-5">
          <AdminSection title="Decision actions">
            <div className="space-y-2"><Button type="button" className="w-full rounded-xl" onClick={() => action("approved", "Generated lesson approved after human review.")}><Check className="size-4" /> Approve</Button><Button type="button" variant="secondary" className="w-full rounded-xl text-red-700" onClick={() => action("rejected", "Generated lesson rejected. Corrections are required.")}><X className="size-4" /> Reject</Button><Button type="button" variant="secondary" className="w-full rounded-xl" onClick={() => action("checking", "Full deterministic validation requested again.")}><RefreshCw className="size-4" /> Request regeneration</Button><Button type="button" className="w-full rounded-xl bg-slate-950 hover:bg-slate-800" disabled={validation.status !== "approved" && validation.status !== "published"} onClick={() => action("published", "Approved generated lesson published to the learner library.")}><Send className="size-4" /> Publish</Button></div>
          </AdminSection>
          <AdminSection title="Regenerate section" description="Simulate a scoped deterministic rewrite.">
            <label className="block"><span className="mb-2 block text-sm font-bold">Section</span><select value={section} onChange={(event) => setSection(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm capitalize outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100">{sections.map((item) => <option key={item}>{item}</option>)}</select></label><Button type="button" variant="secondary" className="mt-3 w-full rounded-xl" onClick={() => { regenerate(lessonId, section); setMessage(`${section} regenerated; lesson returned to human review.`); }}><Sparkles className="size-4" /> Regenerate {section}</Button>
          </AdminSection>
          {validation.sourceLessonId && <AdminSection title="Variation source"><Link href={`/admin/lessons/${validation.sourceLessonId}`} className="text-sm font-bold text-teal-700 hover:underline">{validation.sourceLessonId}</Link></AdminSection>}
        </aside>
      </div>
    </>
  );
}
