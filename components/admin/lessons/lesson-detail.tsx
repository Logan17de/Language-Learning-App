"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Copy, ExternalLink, FileCheck2, Pencil, Send } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { validateAdminLesson } from "@/lib/admin-lesson-validation";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { LessonStatus } from "@/types/lesson";
import type { AudioAsset, ImageAsset } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminSection, AdminStatus } from "@/components/admin/admin-primitives";
import { Button, ButtonLink } from "@/components/ui/button";

const tabs = ["Overview", "Content", "Exercises", "Assets", "Performance", "Reports", "History"] as const;
type DetailTab = typeof tabs[number];

export function LessonDetail({ lessonId }: { lessonId: string }) {
  const generated = useAppStore((state) => state.generatedLessons);
  const reports = useAppStore((state) => state.lessonReports);
  const overrides = useAdminStore((state) => state.lessonOverrides);
  const deleted = useAdminStore((state) => state.deletedLessonIds);
  const stats = useAdminStore((state) => state.lessonStats);
  const validations = useAdminStore((state) => state.validations);
  const audit = useAdminStore((state) => state.auditLog);
  const imageAssets = useAdminStore((state) => state.imageAssets);
  const audioAssets = useAdminStore((state) => state.audioAssets);
  const updateStatus = useAdminStore((state) => state.updateLessonStatus);
  const duplicate = useAdminStore((state) => state.duplicateLesson);
  const ensureValidation = useAdminStore((state) => state.ensureValidation);
  const [tab, setTab] = useState<DetailTab>("Overview");
  const [message, setMessage] = useState("");
  const lesson = useMemo(() => mergeCanonicalLessons(mockLessons, generated, overrides, deleted).find((item) => item.id === lessonId), [deleted, generated, lessonId, overrides]);

  if (!lesson) return <AdminEmptyState title="Lesson not found" description="This lesson ID is invalid, deleted, or unavailable in canonical local content." />;
  const lessonStats = stats.find((item) => item.lessonId === lesson.id);
  const lessonReports = reports.filter((report) => report.lessonId === lesson.id);
  const validation = validations[lesson.id];
  const schema = validateAdminLesson(lesson);

  function status(next: LessonStatus) {
    updateStatus(lesson!, next);
    setMessage(`Lesson changed to ${next}. Learner visibility updated.`);
  }

  return (
    <>
      <AdminPageHeader eyebrow="Lesson detail" title={lesson.title} description={`${lesson.japaneseTitle} · ${lesson.id}`} actions={<div className="flex flex-wrap gap-2"><ButtonLink href={`/lesson/${lesson.id}/preview`} variant="secondary" className="rounded-xl"><ExternalLink className="size-4" /> Learner preview</ButtonLink><ButtonLink href={`/admin/lessons/${lesson.id}/edit`} className="rounded-xl"><Pencil className="size-4" /> Edit lesson</ButtonLink></div>} />
      {message && <p role="status" className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
      <div className="mb-5 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" onClick={() => { ensureValidation(lesson); setMessage(schema.valid ? "Validation passed." : `Validation found ${Object.keys(schema.errors).length} issue(s).`); }}><FileCheck2 className="size-4" /> Run validation</Button>
        <Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" onClick={() => status(lesson.status === "published" ? "draft" : "published")}><Send className="size-4" /> {lesson.status === "published" ? "Unpublish" : "Publish"}</Button>
        <Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" onClick={() => { duplicate(lesson); setMessage("Draft duplicate created."); }}><Copy className="size-4" /> Duplicate</Button>
        <Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" onClick={() => status("archived")}><Archive className="size-4" /> Archive</Button>
      </div>
      <div className="overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Lesson detail sections">{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-11 border-b-2 px-4 text-sm font-bold ${tab === item ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{item}</button>)}</div>
      </div>
      <div className="mt-6">
        {tab === "Overview" && <Overview lesson={lesson} valid={schema.valid} errors={Object.values(schema.errors)} validationScore={validation?.score} />}
        {tab === "Content" && <Content lesson={lesson} />}
        {tab === "Exercises" && <Exercises lesson={lesson} />}
        {tab === "Assets" && <Assets lesson={lesson} imageAssets={imageAssets} audioAssets={audioAssets} />}
        {tab === "Performance" && <Performance stats={lessonStats} />}
        {tab === "Reports" && <AdminSection title="Report history" description="Learner-submitted reports linked by canonical lesson ID.">{lessonReports.length ? <div className="space-y-3">{lessonReports.map((report) => <Link key={report.id} href={`/admin/reports/${report.id}`} className="block rounded-xl border border-slate-200 p-4 hover:bg-slate-50"><div className="flex items-center justify-between"><strong className="capitalize">{report.category}</strong><AdminStatus>{useAdminStore.getState().reportStates[report.id]?.status ?? "new"}</AdminStatus></div><p className="mt-2 text-sm text-slate-600">{report.details}</p><p className="mt-2 text-xs text-slate-400">{report.phase ?? "General"} · {report.createdAt}</p></Link>)}</div> : <p className="py-8 text-center text-sm text-slate-500">No learner reports for this lesson.</p>}</AdminSection>}
        {tab === "History" && <AdminSection title="Change history" description="Central audit entries for this lesson."><div className="space-y-3">{audit.filter((item) => item.entityId === lesson.id || item.entityId.includes(lesson.id)).map((item) => <div key={item.id} className="rounded-xl border border-slate-100 p-4"><div className="flex justify-between gap-3"><strong className="capitalize">{item.action}</strong><time className="text-xs text-slate-400">{new Date(item.timestamp).toLocaleString()}</time></div><p className="mt-1 text-sm text-slate-500">{item.summary}</p></div>)}{!audit.some((item) => item.entityId.includes(lesson.id)) && <p className="py-8 text-center text-sm text-slate-500">No admin changes have been recorded yet.</p>}</div></AdminSection>}
      </div>
    </>
  );
}

function Overview({ lesson, valid, errors, validationScore }: { lesson: NonNullable<ReturnType<typeof mergeCanonicalLessons>[number]>; valid: boolean; errors: string[]; validationScore?: number }) {
  return <div className="grid gap-6 xl:grid-cols-[1fr_.8fr]"><AdminSection title="Metadata"><dl className="grid gap-4 sm:grid-cols-2">{[["Status", <AdminStatus key="s">{lesson.status}</AdminStatus>], ["Source", lesson.source.replaceAll("_", " ")], ["Level", lesson.level], ["Topic", lesson.topic], ["Duration", `${lesson.durationMinutes} minutes`], ["Tags", lesson.tags?.join(", ") || "None"]].map(([term, value]) => <div key={String(term)}><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{term}</dt><dd className="mt-1 text-sm font-semibold capitalize text-slate-800">{value}</dd></div>)}</dl><p className="mt-5 border-t border-slate-100 pt-5 text-sm leading-6 text-slate-600">{lesson.summary}</p></AdminSection><AdminSection title="Validation health"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Structure</span><AdminStatus>{valid ? "passed" : "failed"}</AdminStatus></div><div className="mt-4 flex items-center justify-between"><span className="text-sm font-semibold">Latest generated score</span><strong>{validationScore ?? "Not run"}</strong></div>{errors.length > 0 && <ul className="mt-4 space-y-2 text-sm text-red-700">{errors.map((error) => <li key={error}>• {error}</li>)}</ul>}</AdminSection><AdminSection title="Curriculum coverage" className="xl:col-span-2"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Grammar points" value={lesson.grammar.length} detail={lesson.grammar.map((item) => item.pattern).join(", ")} /><Metric label="Kanji" value={lesson.kanji.length} detail={lesson.kanji.map((item) => item.character).join(" · ")} /><Metric label="Vocabulary" value={lesson.vocabulary.length} detail={lesson.vocabulary.slice(0, 5).map((item) => item.term).join(" · ")} /></div></AdminSection></div>;
}

function Content({ lesson }: { lesson: LessonPackageLike }) {
  return <div className="grid gap-6 xl:grid-cols-2"><AdminSection title="Story">{lesson.story.map((line) => <div key={line.id} className="border-b border-slate-100 py-3 last:border-0"><p className="font-semibold">{line.japanese}</p><p className="mt-1 text-sm text-slate-500">{line.english}</p></div>)}</AdminSection><AdminSection title="Reading passage">{lesson.readingConversation.map((line, index) => <div key={`${line.speaker}_${index}`} className="mb-3 rounded-xl bg-slate-50 p-4"><strong>{line.speaker}</strong><p className="mt-2">{line.japanese}</p><p className="mt-1 text-sm text-slate-500">{line.english}</p></div>)}</AdminSection><AdminSection title="Linked grammar">{lesson.grammar.map((item) => <div key={item.id} className="mb-3 rounded-xl border border-slate-100 p-4"><strong>{item.pattern} — {item.meaning}</strong><p className="mt-2 text-sm text-slate-500">{item.usage}</p></div>)}</AdminSection><AdminSection title="Vocabulary and kanji"><div className="flex flex-wrap gap-2">{lesson.vocabulary.map((item) => <span key={item.term} className="rounded-xl bg-teal-50 px-3 py-2 text-sm"><strong>{item.term}</strong> {item.reading} · {item.meaning}</span>)}</div></AdminSection></div>;
}

function Exercises({ lesson }: { lesson: LessonPackageLike }) {
  const groups = [["Listening", lesson.listeningExercises], ["Speaking", lesson.speakingExercises], ["Final review", lesson.reviewQuestions]] as const;
  return <div className="grid gap-6 xl:grid-cols-3">{groups.map(([label, items]) => <AdminSection key={label} title={label}><div className="space-y-3">{items.map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-4"><p className="font-semibold">{item.prompt}</p>{"choices" in item && <p className="mt-2 text-xs text-slate-500">{item.choices.join(" · ")}</p>}<p className="mt-2 text-xs font-bold text-teal-700">Answer: {"correctAnswer" in item ? item.correctAnswer : item.modelAnswer}</p></div>)}</div></AdminSection>)}</div>;
}

function Assets({ lesson, imageAssets, audioAssets }: { lesson: LessonPackageLike; imageAssets: ImageAsset[]; audioAssets: AudioAsset[] }) {
  const linkedImages = imageAssets.filter((asset) => asset.linkedLessonIds.includes(lesson.id) || lesson.images.some((image) => image.id === asset.id));
  const linkedAudio = audioAssets.filter((asset) => asset.linkedLessonIds.includes(lesson.id) || lesson.listeningExercises.some((exercise) => exercise.audioAssetId === asset.id) || lesson.story.some((line) => line.audioAssetId === asset.id));
  return <div className="grid gap-6 md:grid-cols-2"><AdminSection title="Images">{lesson.images.map((image) => { const metadata = linkedImages.find((asset) => asset.id === image.id); return <div key={image.id} className="mb-3 rounded-xl border border-slate-100 p-4"><div className={`h-24 rounded-lg ${image.accent === "moss" ? "bg-teal-100" : "bg-orange-100"}`} /><div className="mt-3 flex items-center justify-between"><strong>{image.id}</strong>{metadata && <AdminStatus>{metadata.status}</AdminStatus>}</div><p className="mt-1 text-sm text-slate-500">{metadata?.description ?? image.description}</p>{metadata && <p className="mt-2 text-xs text-slate-400">Quality {metadata.qualityScore}/100 · global use {metadata.globalUsageCount} · freshness {metadata.learnerFreshnessScore}/100</p>}</div>; })}{linkedImages.filter((asset) => !lesson.images.some((image) => image.id === asset.id)).map((asset) => <div key={asset.id} className="mb-3 rounded-xl border border-teal-100 bg-teal-50/40 p-4"><strong>{asset.id}</strong><p className="mt-1 text-sm text-slate-600">{asset.description}</p><p className="mt-2 text-xs text-teal-700">Linked through admin asset metadata</p></div>)}</AdminSection><AdminSection title="Mock audio links">{linkedAudio.length ? linkedAudio.map((asset) => <div key={asset.id} className="mb-3 rounded-xl border border-slate-100 p-4"><div className="flex justify-between"><strong>{asset.id}</strong><AdminStatus>{asset.status}</AdminStatus></div><p className="mt-2 text-sm" lang="ja">{asset.japaneseText}</p><p className="mt-2 text-xs text-slate-500">{asset.voice} · {asset.speakingStyle} · {asset.durationSeconds}s</p></div>) : <><p className="text-sm text-slate-600">Story audio IDs: {lesson.story.map((line) => line.audioAssetId).filter(Boolean).join(", ") || "Uses phase-level simulated audio"}</p><p className="mt-4 text-sm text-slate-600">{lesson.listeningExercises.length} listening transcript(s) are ready for linked audio.</p></>}</AdminSection></div>;
}

function Performance({ stats }: { stats?: { completionCount: number; averageScore: number; completionRate: number; failureRate: number; reportCount: number } }) {
  return <AdminSection title="Learner performance summary">{stats ? <div className="grid gap-4 sm:grid-cols-5"><Metric label="Completions" value={stats.completionCount.toLocaleString()} /><Metric label="Average score" value={`${stats.averageScore}%`} /><Metric label="Completion rate" value={`${stats.completionRate}%`} /><Metric label="Failure rate" value={`${stats.failureRate}%`} /><Metric label="Reports" value={stats.reportCount} /></div> : <p className="py-8 text-center text-sm text-slate-500">No learner performance data is available.</p>}</AdminSection>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p>{detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}</div>;
}

type LessonPackageLike = ReturnType<typeof mergeCanonicalLessons>[number];
