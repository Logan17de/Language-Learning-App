"use client";

import { useMemo, useState } from "react";
import { Archive, Copy, Plus, Search, Save } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { GrammarRecord } from "@/types/admin";
import type { JLPTLevel } from "@/types/lesson";
import { AdminEmptyState, AdminPageHeader, AdminSection, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

export function GrammarManagement() {
  const records = useAdminStore((state) => state.grammarRecords);
  const save = useAdminStore((state) => state.saveGrammar);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<JLPTLevel | "all">("all");
  const [editing, setEditing] = useState<GrammarRecord | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const visible = useMemo(() => records.filter((item) => (level === "all" || item.level === level) && (!query || `${item.pattern} ${item.meaning} ${item.nuance}`.toLowerCase().includes(query.toLowerCase()))), [level, query, records]);

  function create() {
    setEditing({ id: `grammar_admin_${records.length + 1}`, pattern: "", level: "N4", meaning: "", formation: "", usageNotes: "", nuance: "", exampleSentences: [""], commonMistakes: [""], prerequisites: [], similarGrammar: [], contrastGrammar: [], lessonUsageCount: 0, archived: false });
  }

  return (
    <>
      <AdminPageHeader eyebrow="Language reference" title="Grammar management" description="Maintain formations, nuance, examples, mistakes, prerequisites, comparisons, and lesson coverage." actions={<Button type="button" className="rounded-xl" onClick={create}><Plus className="size-4" /> Add grammar</Button>} />
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_12rem]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search grammar" value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Pattern, meaning, or nuance" /></label><select aria-label="Grammar level" value={level} onChange={(event) => setLevel(event.target.value as JLPTLevel | "all")} className="admin-input"><option value="all">All levels</option>{["N5", "N4", "N3", "N2", "N1"].map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <AdminSection title="Grammar records" description="Low-coverage and similar patterns are highlighted.">
          {visible.length ? <AdminTable caption="Grammar reference records" headers={["Compare", "Pattern", "Level", "Meaning", "Formation", "Coverage", "Warnings", "Actions"]} rows={visible.map((item) => ({ id: item.id, cells: [<input key="compare" type="checkbox" checked={compare.includes(item.id)} onChange={() => setCompare((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id].slice(-2))} aria-label={`Compare ${item.pattern}`} className="size-4 accent-teal-700" />, <button key="edit" type="button" onClick={() => setEditing(item)} className="font-bold text-teal-700">{item.pattern}</button>, item.level, item.meaning, item.formation, item.lessonUsageCount, <div key="warnings" className="space-y-1">{item.lessonUsageCount === 0 && <AdminStatus>uncovered</AdminStatus>}{item.similarGrammar.length > 0 && <AdminStatus>similar pattern</AdminStatus>}</div>, <div key="actions" className="flex gap-1"><button type="button" aria-label={`Copy ${item.pattern}`} onClick={() => save({ ...item, id: `${item.id}_copy`, pattern: `${item.pattern} copy`, archived: false })} className="grid size-9 place-items-center rounded-lg hover:bg-slate-100"><Copy className="size-4" /></button><button type="button" aria-label={`Archive ${item.pattern}`} onClick={() => save({ ...item, archived: true })} className="grid size-9 place-items-center rounded-lg hover:bg-slate-100"><Archive className="size-4" /></button></div>] }))} /> : <AdminEmptyState title="No grammar found" description="Change the search or level filter." />}
          {compare.length === 2 && <div className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">{compare.map((id) => { const item = records.find((record) => record.id === id)!; return <div key={id}><strong className="text-xl">{item.pattern}</strong><p className="mt-2 text-sm text-slate-600">{item.nuance}</p><p className="mt-2 text-xs text-slate-500">Contrast: {item.contrastGrammar.join(", ") || "None"}</p></div>; })}</div>}
        </AdminSection>
        <AdminSection title={editing ? "Edit grammar" : "Grammar editor"} description="Changes are versioned in the central audit log.">
          {editing ? <GrammarForm record={editing} onChange={setEditing} onSave={() => { if (editing.pattern.trim() && editing.meaning.trim()) { save(editing); setEditing(null); } }} /> : <p className="py-10 text-center text-sm text-slate-500">Select a record or add grammar.</p>}
        </AdminSection>
      </div>
    </>
  );
}

function GrammarForm({ record, onChange, onSave }: { record: GrammarRecord; onChange: (record: GrammarRecord) => void; onSave: () => void }) {
  const fields: Array<[string, keyof Pick<GrammarRecord, "pattern" | "meaning" | "formation" | "usageNotes" | "nuance">]> = [["Pattern", "pattern"], ["Meaning", "meaning"], ["Formation", "formation"], ["Usage notes", "usageNotes"], ["Nuance", "nuance"]];
  return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave(); }}>{fields.map(([label, key]) => <Field key={key} label={label}><textarea required={key === "pattern" || key === "meaning"} value={record[key]} onChange={(event) => onChange({ ...record, [key]: event.target.value })} className="admin-input min-h-16 py-3" /></Field>)}<Field label="Level"><select value={record.level} onChange={(event) => onChange({ ...record, level: event.target.value as JLPTLevel })} className="admin-input">{["N5", "N4", "N3", "N2", "N1"].map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Examples (one per line)"><textarea value={record.exampleSentences.join("\n")} onChange={(event) => onChange({ ...record, exampleSentences: lines(event.target.value) })} className="admin-input min-h-20 py-3" /></Field><Field label="Common mistakes"><textarea value={record.commonMistakes.join("\n")} onChange={(event) => onChange({ ...record, commonMistakes: lines(event.target.value) })} className="admin-input min-h-20 py-3" /></Field><Field label="Prerequisites"><input value={record.prerequisites.join(", ")} onChange={(event) => onChange({ ...record, prerequisites: comma(event.target.value) })} className="admin-input" /></Field><Field label="Similar / contrast grammar"><input value={[...record.similarGrammar, ...record.contrastGrammar].join(", ")} onChange={(event) => onChange({ ...record, similarGrammar: comma(event.target.value) })} className="admin-input" /></Field><Button type="submit" className="w-full rounded-xl"><Save className="size-4" /> Save grammar</Button></form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const comma = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
