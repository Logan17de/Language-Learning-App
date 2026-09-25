"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, RefreshCw, Send, ShieldAlert, Sparkles, X } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { GeneratedValidationStatus, ValidationCategory } from "@/types/admin";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import {
  adminGeneratedRepository,
  type GeneratedDetailData,
} from "@/lib/repositories/admin-generated-repository";

const demoSections = ["story", "vocabulary", "grammar", "reading", "listening", "speaking", "review", "images"];
const demoCategories: ValidationCategory[] = ["Schema", "Curriculum", "Content alignment", "Question quality", "Language quality", "Safety and quality"];

export function GeneratedValidationDetail({ lessonId }: { lessonId: string }) {
  if (getBackendMode() === "supabase") return <BackendValidationDetail lessonId={lessonId} />;
  return <DemoValidationDetail lessonId={lessonId} />;
}

function BackendValidationDetail({ lessonId }: { lessonId: string }) {
  const [data, setData] = useState<GeneratedDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const result = await adminGeneratedRepository.getDetail(lessonId);
    if (result.ok) setData(result.data);
    else setError(result.error.message);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [lessonId]);

  async function decide(decision: "approved" | "rejected") {
    setWorking(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/generated/${lessonId}/decision`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? `Lesson could not be ${decision}.`);
      setWorking(false);
      return;
    }
    setMessage(decision === "approved" ? "Generated lesson approved." : "Generated lesson rejected.");
    setNote("");
    await load();
    setWorking(false);
  }

  async function publish() {
    setWorking(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/lessons/${lessonId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeSummary: note || "Published after generated-lesson review" }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Lesson could not be published.");
      setWorking(false);
      return;
    }
    setMessage("Approved lesson published to the learner library.");
    setNote("");
    await load();
    setWorking(false);
  }

  if (loading && !data) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading generated lesson validation" />;
  if (!data) return <AdminEmptyState title="Generated lesson could not be loaded" description={error || "No stored generated job is linked to this lesson."} />;

  const lesson = data.lesson;
  const validation = data.validation;
  const categories = Array.from(new Set(data.checks.map((check) => check.category)));
  const warningCount = validation?.warnings.length ?? 0;
  const currentStatus = lesson?.status || validation?.status || data.job.status;

  return (
    <>
      <AdminPageHeader
        eyebrow="Live generated lesson validation"
        title={lesson?.title || data.request?.topic || `Generated lesson ${lessonId.slice(0, 8)}`}
        description={`${lessonId} · ${data.requester?.display_name || maskEmail(data.requester?.email || "") || data.job.created_by} · requested topic: ${data.request?.topic || "Unavailable"}`}
        actions={<div className="flex flex-wrap gap-2">{lesson && <ButtonLink href={`/admin/lessons/${lesson.id}/edit`} variant="secondary" className="rounded-xl">Edit lesson</ButtonLink>}{lesson && <ButtonLink href={`/lesson/${lesson.id}/preview`} variant="secondary" className="rounded-xl">Learner preview</ButtonLink>}<Button type="button" variant="secondary" className="rounded-xl" disabled={loading || working} onClick={() => void load()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div>}
      />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Current status" value={currentStatus.replaceAll("_", " ")} status />
        <SummaryCard label="Validation score" value={validation ? `${validation.score}/100` : "Not run"} />
        <SummaryCard label="Warnings" value={warningCount.toString()} />
        <SummaryCard label="Generation time" value={data.job.generation_seconds ? `${data.job.generation_seconds.toFixed(1)}s` : "Not recorded"} />
      </div>

      {data.job.error_message && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5"><div className="flex items-center gap-2 font-bold text-red-800"><ShieldAlert className="size-5" />Generation error</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-700">{data.job.error_message}</p></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <AdminSection title="Request & generation context">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Request ID" value={data.job.custom_lesson_request_id} />
              <Fact label="Job ID" value={data.job.id} />
              <Fact label="Requester" value={data.requester?.display_name || data.requester?.email || data.job.created_by} />
              <Fact label="JLPT" value={data.request?.jlpt_level || lesson?.jlpt_level || "—"} />
              <Fact label="Created" value={new Date(data.job.created_at).toLocaleString()} />
              <Fact label="Source lesson" value={data.job.source_lesson_id || lesson?.source_lesson_id || "None"} />
            </dl>
          </AdminSection>

          {categories.map((category) => (
            <AdminSection key={category} title={category}>
              {data.checks.filter((check) => check.category === category).map((check) => (
                <div key={check.id} className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0">
                  <SeverityIcon severity={check.severity} />
                  <div className="flex-1"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{check.label}</strong><AdminStatus>{check.severity}</AdminStatus></div><p className="mt-1 text-sm text-slate-500">{check.detail}</p></div>
                </div>
              ))}
            </AdminSection>
          ))}

          {!categories.length && <AdminSection title="Validation checks"><p className="py-8 text-center text-sm text-slate-500">No persisted validation checks exist for this generated lesson.</p></AdminSection>}

          <AdminSection title="Validation warnings">
            {validation?.warnings.length ? <ul className="space-y-2">{validation.warnings.map((warning, index) => <li key={`${warning}-${index}`} className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{warning}</li>)}</ul> : <p className="py-6 text-center text-sm text-slate-500">No persisted warnings.</p>}
          </AdminSection>
        </div>

        <aside className="space-y-5">
          <AdminSection title="Decision actions" description="These operations write to Supabase and are audit logged.">
            <label className="block"><span className="mb-2 block text-sm font-bold">Reviewer note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} className="admin-input min-h-28 py-3" placeholder="Optional reason, correction note, or publish summary" /></label>
            <div className="mt-3 space-y-2">
              <Button type="button" className="w-full rounded-xl" disabled={working || currentStatus === "published"} onClick={() => void decide("approved")}><Check className="size-4" />Approve</Button>
              <Button type="button" variant="secondary" className="w-full rounded-xl text-red-700" disabled={working || currentStatus === "published"} onClick={() => void decide("rejected")}><X className="size-4" />Reject</Button>
              <Button type="button" className="w-full rounded-xl bg-slate-950 hover:bg-slate-800" disabled={working || !["approved", "published"].includes(currentStatus)} onClick={() => void publish()}><Send className="size-4" />{currentStatus === "published" ? "Published" : "Publish"}</Button>
            </div>
          </AdminSection>

          <AdminSection title="Regeneration">
            <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Section-level regeneration used to be a local simulation. It is intentionally disabled here until a server-side generation endpoint can preserve approved regions and audit the replacement content.
            </div>
            <Link href="/admin/generated" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-teal-700 hover:underline"><Sparkles className="size-4" />Return to generation queue</Link>
          </AdminSection>

          {data.job.source_lesson_id && <AdminSection title="Variation source"><Link href={`/admin/lessons/${data.job.source_lesson_id}`} className="break-all text-sm font-bold text-teal-700 hover:underline">{data.job.source_lesson_id}</Link></AdminSection>}
        </aside>
      </div>
    </>
  );
}

function SummaryCard({ label, value, status = false }: { label: string; value: string; status?: boolean }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>{status ? <div className="mt-3"><AdminStatus>{value}</AdminStatus></div> : <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>}</div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 break-all text-sm font-semibold text-slate-700">{value}</dd></div>;
}

function SeverityIcon({ severity }: { severity: string }) {
  const passed = severity === "passed";
  const warning = severity === "warning";
  return <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${passed ? "bg-emerald-50 text-emerald-700" : warning ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{passed ? <Check className="size-4" /> : warning ? <ShieldAlert className="size-4" /> : <X className="size-4" />}</span>;
}

function maskEmail(email: string) {
  return email ? email.replace(/(^.).+(@.*$)/, "$1•••$2") : "";
}

function DemoValidationDetail({ lessonId }: { lessonId: string }) {
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

  if (!lesson) return <AdminEmptyState title="Generated lesson not found" description="The demo generated entity ID is invalid or has been removed." />;
  if (!validation) return <div className="h-72 animate-pulse rounded-2xl bg-slate-100" aria-label="Preparing demo validation" />;

  function action(status: GeneratedValidationStatus, noteText: string) {
    setStatus(lessonId, status, noteText);
    setMessage(noteText);
  }

  return (
    <>
      <AdminPageHeader eyebrow="Demo generated validation" title={lesson.title} description={`${lesson.id} · requested by ${validation.requester} for ${validation.requestedTopic}`} actions={<div className="flex gap-2"><ButtonLink href={`/admin/lessons/${lesson.id}/edit`} variant="secondary" className="rounded-xl">Edit lesson</ButtonLink><ButtonLink href={`/lesson/${lesson.id}/preview`} variant="secondary" className="rounded-xl">Learner preview</ButtonLink></div>} />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3"><SummaryCard label="Validation score" value={`${validation.score}/100`} /><SummaryCard label="Current status" value={validation.status} status /><SummaryCard label="Warnings" value={validation.warnings.length.toString()} /></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]"><div className="space-y-5">{demoCategories.map((category) => <AdminSection key={category} title={category}>{validation.checks.filter((check) => check.category === category).map((check) => <div key={check.id} className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0"><SeverityIcon severity={check.severity} /><div className="flex-1"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{check.label}</strong><AdminStatus>{check.severity}</AdminStatus></div><p className="mt-1 text-sm text-slate-500">{check.detail}</p></div></div>)}</AdminSection>)}</div><aside className="space-y-5"><AdminSection title="Demo decision actions"><div className="space-y-2"><Button type="button" className="w-full rounded-xl" onClick={() => action("approved", "Demo lesson approved.")}><Check className="size-4" />Approve</Button><Button type="button" variant="secondary" className="w-full rounded-xl text-red-700" onClick={() => action("rejected", "Demo lesson rejected.")}><X className="size-4" />Reject</Button><Button type="button" className="w-full rounded-xl bg-slate-950 hover:bg-slate-800" disabled={validation.status !== "approved" && validation.status !== "published"} onClick={() => action("published", "Demo lesson published.")}><Send className="size-4" />Publish</Button></div></AdminSection><AdminSection title="Regenerate section" description="Demo-only local rewrite simulation."><select value={section} onChange={(event) => setSection(event.target.value)} className="admin-input capitalize">{demoSections.map((item) => <option key={item}>{item}</option>)}</select><Button type="button" variant="secondary" className="mt-3 w-full rounded-xl" onClick={() => { regenerate(lessonId, section); setMessage(`${section} regenerated in demo state.`); }}><Sparkles className="size-4" />Regenerate {section}</Button></AdminSection></aside></div>
    </>
  );
}
