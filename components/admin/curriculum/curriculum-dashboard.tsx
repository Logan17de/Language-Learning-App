"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Download, Plus, Save } from "lucide-react";
import { curriculumLevels } from "@/data/mock-admin";
import { useAdminStore } from "@/store/admin-store";
import type { CurriculumItem } from "@/types/admin";
import type { JLPTLevel } from "@/types/lesson";
import { AdminPageHeader, AdminSection, AdminStatCard, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

export function CurriculumDashboard() {
  const items = useAdminStore((state) => state.curriculumItems);
  const saveItem = useAdminStore((state) => state.saveCurriculumItem);
  const [level, setLevel] = useState<JLPTLevel>("N5");
  const [editing, setEditing] = useState<CurriculumItem | null>(null);
  const visible = useMemo(() => items.filter((item) => item.level === level).sort((a, b) => a.order - b.order), [items, level]);
  const summary = curriculumLevels.find((item) => item.level === level)!;

  function exportJson() {
    const blob = new Blob([JSON.stringify({ levels: curriculumLevels, items }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aiko-curriculum.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function move(item: CurriculumItem, delta: number) {
    saveItem({ ...item, order: Math.max(1, item.order + delta) });
  }

  return (
    <>
      <AdminPageHeader eyebrow="Curriculum operations" title="Curriculum management" description="Sequence deterministic JLPT coverage, prerequisites, required concepts, and canonical lesson assignments." actions={<div className="flex gap-2"><Button type="button" variant="secondary" className="rounded-xl" onClick={exportJson}><Download className="size-4" /> Export JSON</Button><Button type="button" className="rounded-xl" onClick={() => setEditing({ id: `cur_new_${items.length + 1}`, level, type: "grammar", label: "", order: visible.length + 1, required: true, prerequisites: [], lessonIds: [] })}><Plus className="size-4" /> Add item</Button></div>} />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="JLPT levels">{curriculumLevels.map((item) => <button key={item.level} type="button" role="tab" aria-selected={level === item.level} onClick={() => setLevel(item.level)} className={`min-h-11 min-w-24 rounded-xl px-4 text-sm font-bold ${level === item.level ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{item.level}</button>)}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminStatCard label="Grammar total" value={summary.grammarTotal} /><AdminStatCard label="Kanji total" value={summary.kanjiTotal} tone="blue" /><AdminStatCard label="Vocabulary total" value={summary.vocabularyTotal} tone="orange" /><AdminStatCard label="Lesson coverage" value={`${summary.lessonCoverage}%`} detail={`${summary.uncoveredConcepts} uncovered · ${summary.prerequisiteGaps} prerequisite gaps`} tone={summary.lessonCoverage < 50 ? "red" : "teal"} /></div>
      <AdminSection title={`${summary.title} sequence`} description="A visual prerequisite path; use the editor below to change persisted item order." className="mt-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">{summary.sequence.map((item, index) => <div key={item} className="flex shrink-0 items-center gap-2"><span className="rounded-xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900">{item}</span>{index < summary.sequence.length - 1 && <ArrowRight className="size-4 text-slate-300" />}</div>)}</div>
      </AdminSection>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_23rem]">
        <AdminSection title={`${level} curriculum items`} description={`${summary.duplicateCoverage} duplicate coverage signal(s) · ${summary.prerequisiteGaps} prerequisite gap(s)`}>
          <AdminTable caption={`${level} curriculum items`} headers={["Order", "Concept", "Type", "Required", "Prerequisites", "Lesson coverage", "Move"]} rows={visible.map((item) => ({ id: item.id, cells: [item.order, <button key="edit" type="button" onClick={() => setEditing(item)} className="font-bold text-teal-700 hover:underline">{item.label}</button>, item.type, <AdminStatus key="required">{item.required ? "required" : "optional"}</AdminStatus>, item.prerequisites.join(", ") || "None", item.lessonIds.length ? `${item.lessonIds.length} lesson(s)` : <span key="uncovered" className="font-bold text-red-600">Uncovered</span>, <div key="move" className="flex gap-1"><button type="button" aria-label={`Move ${item.label} earlier`} onClick={() => move(item, -1)} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><ArrowUp className="size-4" /></button><button type="button" aria-label={`Move ${item.label} later`} onClick={() => move(item, 1)} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><ArrowDown className="size-4" /></button></div>] }))} />
        </AdminSection>
        <AdminSection title={editing ? "Edit curriculum item" : "Select an item"} description="Persist order, prerequisites, requirement, and lesson coverage.">
          {editing ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (editing.label.trim()) { saveItem(editing); setEditing(null); } }}><Field label="Label"><input required value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} className="admin-input" /></Field><Field label="Type"><select value={editing.type} onChange={(event) => setEditing({ ...editing, type: event.target.value as CurriculumItem["type"] })} className="admin-input"><option>grammar</option><option>kanji</option><option>vocabulary</option></select></Field><Field label="Order"><input type="number" min={1} value={editing.order} onChange={(event) => setEditing({ ...editing, order: Number(event.target.value) })} className="admin-input" /></Field><Field label="Prerequisite IDs"><input value={editing.prerequisites.join(", ")} onChange={(event) => setEditing({ ...editing, prerequisites: split(event.target.value) })} className="admin-input" /></Field><Field label="Covered lesson IDs"><textarea value={editing.lessonIds.join("\n")} onChange={(event) => setEditing({ ...editing, lessonIds: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} className="admin-input min-h-24 py-3" /></Field><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={editing.required} onChange={(event) => setEditing({ ...editing, required: event.target.checked })} className="size-4 accent-teal-700" /> Required concept</label><Button type="submit" className="w-full rounded-xl"><Save className="size-4" /> Save curriculum item</Button></form> : <p className="py-10 text-center text-sm text-slate-500">Choose an item or add a new concept.</p>}
        </AdminSection>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>;
}

function split(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
