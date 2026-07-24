"use client";

import { useMemo, useState } from "react";
import { Archive, Copy, Plus, Search, Save } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { KanjiRecord, VocabularyRecord } from "@/types/admin";
import type { JLPTLevel } from "@/types/lesson";
import { AdminEmptyState, AdminPageHeader, AdminSection, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

type Tab = "Kanji" | "Vocabulary";

export function VocabularyManagement() {
  const kanji = useAdminStore((state) => state.kanjiRecords);
  const vocabulary = useAdminStore((state) => state.vocabularyRecords);
  const saveKanji = useAdminStore((state) => state.saveKanji);
  const saveVocabulary = useAdminStore((state) => state.saveVocabulary);
  const [tab, setTab] = useState<Tab>("Kanji");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<JLPTLevel | "all">("all");
  const [editingKanji, setEditingKanji] = useState<KanjiRecord | null>(null);
  const [editingVocabulary, setEditingVocabulary] = useState<VocabularyRecord | null>(null);
  const kanjiRows = useMemo(() => kanji.filter((item) => (level === "all" || item.level === level) && (!query || `${item.character} ${item.meanings.join(" ")} ${item.readings.join(" ")}`.toLowerCase().includes(query.toLowerCase()))), [kanji, level, query]);
  const vocabRows = useMemo(() => vocabulary.filter((item) => (level === "all" || item.level === level) && (!query || `${item.writtenForm} ${item.reading} ${item.meaning}`.toLowerCase().includes(query.toLowerCase()))), [level, query, vocabulary]);

  function add() {
    if (tab === "Kanji") setEditingKanji({ id: `kanji_admin_${kanji.length + 1}`, character: "", level: "N5", meanings: [], readings: [], onyomi: [], kunyomi: [], exampleWords: [], strokeCount: 1, prerequisiteKanji: [], lessonUsageCount: 0, archived: false });
    else setEditingVocabulary({ id: `vocab_admin_${vocabulary.length + 1}`, writtenForm: "", reading: "", meaning: "", partOfSpeech: "noun", level: "N5", tags: [], exampleSentence: "", linkedKanji: [], lessonUsageCount: 0, archived: false });
  }

  return (
    <>
      <AdminPageHeader eyebrow="Curriculum reference" title="Kanji & vocabulary" description="Detect duplicates, missing readings or meanings, and concepts that are not linked to canonical lessons." actions={<Button type="button" className="rounded-xl" onClick={add}><Plus className="size-4" /> Add {tab.toLowerCase()}</Button>} />
      <div className="mb-5 flex gap-2" role="tablist">{(["Kanji", "Vocabulary"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-11 rounded-xl px-5 text-sm font-bold ${tab === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white"}`}>{item}</button>)}</div>
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_12rem]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label={`Search ${tab}`} value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder={`Search ${tab.toLowerCase()}`} /></label><select aria-label="JLPT level" value={level} onChange={(event) => setLevel(event.target.value as JLPTLevel | "all")} className="admin-input"><option value="all">All levels</option>{["N5", "N4", "N3", "N2", "N1"].map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <AdminSection title={`${tab} records`} description="Archived records remain locally available for audit.">
          {tab === "Kanji" ? kanjiRows.length ? <AdminTable caption="Kanji records" headers={["Character", "Level", "Meanings", "Readings", "Strokes", "Examples", "Usage", "Warnings", "Actions"]} rows={kanjiRows.map((item) => ({ id: item.id, cells: [<button key="edit" type="button" onClick={() => setEditingKanji(item)} className="text-2xl font-bold text-teal-800">{item.character || "—"}</button>, item.level, item.meanings.join(", ") || "Missing", item.readings.join(", ") || "Missing", item.strokeCount, item.exampleWords.join(", "), item.lessonUsageCount, <Warnings key="warning" missingReading={!item.readings.length} missingMeaning={!item.meanings.length} unlinked={item.lessonUsageCount === 0} />, <Actions key="actions" onCopy={() => saveKanji({ ...item, id: `${item.id}_copy`, character: `${item.character}’`, archived: false })} onArchive={() => saveKanji({ ...item, archived: true })} />] }))} /> : <AdminEmptyState title="No kanji found" description="Change the filters or add a new kanji record." /> : vocabRows.length ? <AdminTable caption="Vocabulary records" headers={["Written", "Reading", "Meaning", "Part of speech", "Level", "Linked kanji", "Usage", "Warnings", "Actions"]} rows={vocabRows.map((item) => ({ id: item.id, cells: [<button key="edit" type="button" onClick={() => setEditingVocabulary(item)} className="font-bold text-teal-800">{item.writtenForm || "—"}</button>, item.reading || "Missing", item.meaning || "Missing", item.partOfSpeech, item.level, item.linkedKanji.join(", "), item.lessonUsageCount, <Warnings key="warning" missingReading={!item.reading} missingMeaning={!item.meaning} unlinked={item.lessonUsageCount === 0} />, <Actions key="actions" onCopy={() => saveVocabulary({ ...item, id: `${item.id}_copy`, writtenForm: `${item.writtenForm} copy`, archived: false })} onArchive={() => saveVocabulary({ ...item, archived: true })} />] }))} /> : <AdminEmptyState title="No vocabulary found" description="Change the filters or add a vocabulary record." />}
        </AdminSection>
        <AdminSection title={`Edit ${tab.toLowerCase()}`} description="Structured fields persist in the admin store.">
          {tab === "Kanji" ? editingKanji ? <KanjiForm value={editingKanji} onChange={setEditingKanji} onSave={() => { if (editingKanji.character.trim()) { saveKanji(editingKanji); setEditingKanji(null); } }} /> : <EmptyEditor /> : editingVocabulary ? <VocabularyForm value={editingVocabulary} onChange={setEditingVocabulary} onSave={() => { if (editingVocabulary.writtenForm.trim()) { saveVocabulary(editingVocabulary); setEditingVocabulary(null); } }} /> : <EmptyEditor />}
        </AdminSection>
      </div>
    </>
  );
}

function Warnings({ missingReading, missingMeaning, unlinked }: { missingReading: boolean; missingMeaning: boolean; unlinked: boolean }) { return <div className="space-y-1">{missingReading && <AdminStatus>missing reading</AdminStatus>}{missingMeaning && <AdminStatus>missing meaning</AdminStatus>}{unlinked && <AdminStatus>unlinked lesson</AdminStatus>}</div>; }
function Actions({ onCopy, onArchive }: { onCopy: () => void; onArchive: () => void }) { return <div className="flex"><button type="button" onClick={onCopy} aria-label="Duplicate record" className="grid size-9 place-items-center rounded-lg hover:bg-slate-100"><Copy className="size-4" /></button><button type="button" onClick={onArchive} aria-label="Archive record" className="grid size-9 place-items-center rounded-lg hover:bg-slate-100"><Archive className="size-4" /></button></div>; }
function EmptyEditor() { return <p className="py-10 text-center text-sm text-slate-500">Select a record or add a new one.</p>; }

function KanjiForm({ value, onChange, onSave }: { value: KanjiRecord; onChange: (value: KanjiRecord) => void; onSave: () => void }) {
  return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave(); }}><TextField label="Character" value={value.character} onChange={(text) => onChange({ ...value, character: text })} required /><SelectLevel value={value.level} onChange={(level) => onChange({ ...value, level })} /><TextField label="Meanings" value={value.meanings.join(", ")} onChange={(text) => onChange({ ...value, meanings: comma(text) })} /><TextField label="Readings" value={value.readings.join(", ")} onChange={(text) => onChange({ ...value, readings: comma(text) })} /><TextField label="Onyomi" value={value.onyomi.join(", ")} onChange={(text) => onChange({ ...value, onyomi: comma(text) })} /><TextField label="Kunyomi" value={value.kunyomi.join(", ")} onChange={(text) => onChange({ ...value, kunyomi: comma(text) })} /><TextField label="Example words" value={value.exampleWords.join(", ")} onChange={(text) => onChange({ ...value, exampleWords: comma(text) })} /><TextField label="Prerequisite kanji" value={value.prerequisiteKanji.join(", ")} onChange={(text) => onChange({ ...value, prerequisiteKanji: comma(text) })} /><label className="block"><span className="field-label">Stroke count</span><input type="number" min={1} value={value.strokeCount} onChange={(event) => onChange({ ...value, strokeCount: Number(event.target.value) })} className="admin-input" /></label><SaveButton /></form>;
}

function VocabularyForm({ value, onChange, onSave }: { value: VocabularyRecord; onChange: (value: VocabularyRecord) => void; onSave: () => void }) {
  return <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSave(); }}><TextField label="Written form" value={value.writtenForm} onChange={(text) => onChange({ ...value, writtenForm: text })} required /><TextField label="Reading" value={value.reading} onChange={(text) => onChange({ ...value, reading: text })} /><TextField label="Meaning" value={value.meaning} onChange={(text) => onChange({ ...value, meaning: text })} /><TextField label="Part of speech" value={value.partOfSpeech} onChange={(text) => onChange({ ...value, partOfSpeech: text })} /><SelectLevel value={value.level} onChange={(level) => onChange({ ...value, level })} /><TextField label="Tags" value={value.tags.join(", ")} onChange={(text) => onChange({ ...value, tags: comma(text) })} /><TextField label="Example sentence" value={value.exampleSentence} onChange={(text) => onChange({ ...value, exampleSentence: text })} /><TextField label="Linked kanji" value={value.linkedKanji.join(", ")} onChange={(text) => onChange({ ...value, linkedKanji: comma(text) })} /><SaveButton /></form>;
}

function TextField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label className="block"><span className="field-label">{label}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="admin-input" /></label>; }
function SelectLevel({ value, onChange }: { value: JLPTLevel; onChange: (value: JLPTLevel) => void }) { return <label className="block"><span className="field-label">JLPT level</span><select value={value} onChange={(event) => onChange(event.target.value as JLPTLevel)} className="admin-input">{["N5", "N4", "N3", "N2", "N1"].map((item) => <option key={item}>{item}</option>)}</select></label>; }
function SaveButton() { return <Button type="submit" className="w-full rounded-xl"><Save className="size-4" /> Save record</Button>; }
const comma = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
