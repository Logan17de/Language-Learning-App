"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, Copy, Download, Eye, FileCheck2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { JLPTLevel, LessonPackage, LessonSource, LessonStatus } from "@/types/lesson";
import { AdminConfirmDialog, AdminEmptyState, AdminPageHeader, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import { useBackendAdminLessonStore } from "@/store/backend-admin-lesson-store";

type SortKey = "title" | "level" | "status" | "updated";

export function LessonManagementTable() {
  const searchParams = useSearchParams();
  const generated = useAppStore((state) => state.generatedLessons);
  const overrides = useAdminStore((state) => state.lessonOverrides);
  const deleted = useAdminStore((state) => state.deletedLessonIds);
  const stats = useAdminStore((state) => state.lessonStats);
  const updateStatus = useAdminStore((state) => state.updateLessonStatus);
  const duplicate = useAdminStore((state) => state.duplicateLesson);
  const deleteLesson = useAdminStore((state) => state.deleteLesson);
  const bulkUpdate = useAdminStore((state) => state.bulkUpdateLessons);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [level, setLevel] = useState<JLPTLevel | "all">("all");
  const [status, setStatus] = useState<LessonStatus | "all">("all");
  const [source, setSource] = useState<LessonSource | "all">("all");
  const [reportedOnly, setReportedOnly] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("updated");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<LessonPackage | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const backendLessons = useBackendAdminLessonStore((state) => state.lessons);
  const loadBackendLessons = useBackendAdminLessonStore((state) => state.load);
  const setBackendStatus = useBackendAdminLessonStore((state) => state.setStatus);
  const allLessons = useMemo(
    () => getBackendMode() === "supabase" ? backendLessons : mergeCanonicalLessons(mockLessons, generated, overrides, deleted),
    [backendLessons, deleted, generated, overrides],
  );

  useEffect(() => {
    if (getBackendMode() === "supabase") void loadBackendLessons();
  }, [loadBackendLessons]);

  function changeStatus(lesson: LessonPackage, nextStatus: LessonStatus) {
    if (getBackendMode() === "supabase") void setBackendStatus(lesson, nextStatus);
    else updateStatus(lesson, nextStatus);
  }

  function changeStatuses(lessons: LessonPackage[], nextStatus: LessonStatus) {
    if (getBackendMode() === "supabase") void Promise.all(lessons.map((lesson) => setBackendStatus(lesson, nextStatus)));
    else bulkUpdate(lessons, nextStatus);
  }
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return allLessons
      .filter((lesson) => !normalized || [lesson.title, lesson.japaneseTitle, lesson.topic, ...(lesson.tags ?? [])].join(" ").toLowerCase().includes(normalized))
      .filter((lesson) => level === "all" || lesson.level === level)
      .filter((lesson) => status === "all" || lesson.status === status)
      .filter((lesson) => source === "all" || lesson.source === source)
      .filter((lesson) => !reportedOnly || (stats.find((item) => item.lessonId === lesson.id)?.reportCount ?? 0) > 0)
      .filter((lesson) => !missingOnly || !lesson.images.length || !lesson.listeningExercises.length || !lesson.answerKeys.length)
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);
        if (sort === "level") return a.level.localeCompare(b.level);
        if (sort === "status") return a.status.localeCompare(b.status);
        return (stats.find((item) => item.lessonId === b.id)?.updatedAt ?? "").localeCompare(stats.find((item) => item.lessonId === a.id)?.updatedAt ?? "");
      });
  }, [allLessons, level, missingOnly, query, reportedOnly, sort, source, stats, status]);
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);
  const selectedLessons = allLessons.filter((lesson) => selected.includes(lesson.id));

  function exportLessons(items: LessonPackage[]) {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aiko-lessons.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <>
      <AdminPageHeader eyebrow="Content management" title="Lesson library" description="Manage curated, generated, draft, approved, published, rejected, archived, and malformed lesson packages from one canonical content view." actions={<div className="flex flex-wrap gap-2"><ButtonLink href="/admin/lessons/import" variant="secondary" className="rounded-xl"><Upload className="size-4" /> Import full lesson</ButtonLink><ButtonLink href="/admin/lessons/new/edit" className="rounded-xl"><Plus className="size-4" /> Create lesson</ButtonLink></div>} />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2"><span className="sr-only">Search lessons</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" placeholder="Search titles, topics, and tags" /></label>
          <Filter label="Level" value={level} onChange={(value) => setLevel(value as JLPTLevel | "all")} options={["all", "N5", "N4", "N3", "N2", "N1"]} />
          <Filter label="Status" value={status} onChange={(value) => setStatus(value as LessonStatus | "all")} options={["all", "draft", "approved", "published", "rejected", "archived", "malformed"]} />
          <Filter label="Source" value={source} onChange={(value) => setSource(value as LessonSource | "all")} options={["all", "curated_seed", "generated", "user_generated", "community"]} />
          <Filter label="Sort" value={sort} onChange={(value) => setSort(value as SortKey)} options={["updated", "title", "level", "status"]} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm"><CheckFilter checked={reportedOnly} onChange={setReportedOnly} label="Reported content" /><CheckFilter checked={missingOnly} onChange={setMissingOnly} label="Missing assets or answers" /></div>
      </div>
      {selected.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 p-3"><span className="mr-2 text-sm font-bold text-teal-900">{selected.length} selected</span><Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" onClick={() => changeStatuses(selectedLessons, "published")}>Publish</Button><Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" onClick={() => changeStatuses(selectedLessons, "draft")}>Unpublish</Button><Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" onClick={() => changeStatuses(selectedLessons, "archived")}>Archive</Button><Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" onClick={() => selectedLessons.forEach(duplicate)}>Duplicate</Button><Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" onClick={() => exportLessons(selectedLessons)}><Download className="size-4" /> Export</Button><Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4 text-red-700" onClick={() => setBulkDeleteOpen(true)}><Trash2 className="size-4" /> Delete</Button></div>}
      <div className="mt-5 hidden lg:block">
        {visible.length ? <AdminTable caption="Admin lesson library" headers={["Select", "Lesson", "Level", "Topic", "Source", "Status", "Duration", "Grammar", "Kanji", "Completions", "Score", "Reports", "Updated", "Actions"]} rows={visible.map((lesson) => {
          const lessonStats = stats.find((item) => item.lessonId === lesson.id);
          return { id: lesson.id, cells: [
            <input key="select" type="checkbox" checked={selected.includes(lesson.id)} onChange={() => toggle(lesson.id)} aria-label={`Select ${lesson.title}`} className="size-4 accent-teal-700" />,
            <div key="lesson" className="min-w-48"><Link href={`/admin/lessons/${lesson.id}`} className="font-bold text-slate-900 hover:text-teal-700">{lesson.title}</Link><p className="mt-1 text-xs text-slate-500">{lesson.japaneseTitle}</p></div>,
            lesson.level, lesson.topic, lesson.source.replaceAll("_", " "), <AdminStatus key="status">{lesson.status}</AdminStatus>, `${lesson.durationMinutes}m`, lesson.grammar.length, lesson.kanji.length,
            lessonStats?.completionCount.toLocaleString() ?? 0, `${lessonStats?.averageScore ?? 0}%`, lessonStats?.reportCount ?? 0, lessonStats?.updatedAt ?? "Today",
            <LessonActions key="actions" lesson={lesson} onStatus={changeStatus} onDuplicate={duplicate} onDelete={() => setDeleteTarget(lesson)} />,
          ] };
        })} /> : <AdminEmptyState title="No lessons found" description="Adjust the search or filters to restore canonical lesson records." />}
      </div>
      <div className="mt-5 grid gap-4 lg:hidden">
        {visible.map((lesson) => <article key={lesson.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><Link href={`/admin/lessons/${lesson.id}`} className="font-bold text-slate-900">{lesson.title}</Link><p className="mt-1 text-sm text-slate-500">{lesson.japaneseTitle}</p></div><AdminStatus>{lesson.status}</AdminStatus></div><p className="mt-4 text-sm text-slate-600">{lesson.level} · {lesson.topic} · {lesson.durationMinutes} min</p><div className="mt-4"><LessonActions lesson={lesson} onStatus={changeStatus} onDuplicate={duplicate} onDelete={() => setDeleteTarget(lesson)} /></div></article>)}
      </div>
      <div className="mt-5 flex items-center justify-between text-sm text-slate-500"><span>{filtered.length} records · page {Math.min(page, pages)} of {pages}</span><div className="flex gap-2"><Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button type="button" variant="secondary" className="min-h-10 rounded-lg px-4" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
      <AdminConfirmDialog open={Boolean(deleteTarget)} title="Delete mock lesson?" description={`${deleteTarget?.title ?? "This lesson"} will be removed from canonical local content. This cannot be undone without resetting admin mock data.`} confirmLabel="Delete lesson" onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) deleteLesson(deleteTarget); }} />
      <AdminConfirmDialog open={bulkDeleteOpen} title={`Delete ${selectedLessons.length} mock lessons?`} description="Every selected record will be removed from canonical local content. Reset admin mock data to recover deterministic fixtures." confirmLabel="Delete selected lessons" onClose={() => setBulkDeleteOpen(false)} onConfirm={() => { selectedLessons.forEach(deleteLesson); setSelected([]); }} />
    </>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm capitalize outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100">{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>;
}

function CheckFilter({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-teal-700" /> {label}</label>;
}

function LessonActions({ lesson, onStatus, onDuplicate, onDelete }: { lesson: LessonPackage; onStatus: (lesson: LessonPackage, status: LessonStatus) => void; onDuplicate: (lesson: LessonPackage) => void; onDelete: () => void }) {
  return <div className="flex min-w-max gap-1"><ActionLink href={`/lesson/${lesson.id}/preview`} label="Preview"><Eye className="size-4" /></ActionLink><ActionLink href={`/admin/lessons/${lesson.id}/edit`} label="Edit"><Pencil className="size-4" /></ActionLink><ActionLink href={lesson.source.includes("generated") ? `/admin/generated/${lesson.id}` : `/admin/lessons/${lesson.id}`} label="Validate"><FileCheck2 className="size-4" /></ActionLink><ActionButton label="Duplicate" onClick={() => onDuplicate(lesson)}><Copy className="size-4" /></ActionButton><ActionButton label={lesson.status === "published" ? "Unpublish" : "Publish"} onClick={() => onStatus(lesson, lesson.status === "published" ? "draft" : "published")}><FileCheck2 className="size-4" /></ActionButton><ActionButton label="Archive" onClick={() => onStatus(lesson, "archived")}><Archive className="size-4" /></ActionButton><ActionButton label="Delete" onClick={onDelete} danger><Trash2 className="size-4" /></ActionButton></div>;
}

function ActionLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return <Link href={href} title={label} aria-label={`${label} lesson`} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-teal-700">{children}</Link>;
}

function ActionButton({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return <button type="button" title={label} aria-label={`${label} lesson`} onClick={onClick} className={`grid size-9 place-items-center rounded-lg ${danger ? "text-red-500 hover:bg-red-50" : "text-slate-500 hover:bg-slate-100 hover:text-teal-700"}`}>{children}</button>;
}
