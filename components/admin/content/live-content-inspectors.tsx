"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminSection,
  AdminStatCard,
  AdminStatus,
  AdminTable,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { adminOperationsRepository } from "@/lib/repositories/admin-operations-repository";
import {
  adminContentInspectorRepository,
  type CurriculumInspectorData,
} from "@/lib/repositories/admin-content-inspector-repository";
import type { Database } from "@/types/database";

type Grammar = Database["public"]["Tables"]["grammar_records"]["Row"];
type Kanji = Database["public"]["Tables"]["kanji_records"]["Row"];
type Vocabulary = Database["public"]["Tables"]["vocabulary_records"]["Row"];
type ImageAsset = Database["public"]["Tables"]["image_assets"]["Row"];
type AudioAsset = Database["public"]["Tables"]["audio_assets"]["Row"];

const levels = ["N5", "N4", "N3", "N2", "N1"] as const;

export function LiveGrammarInspector() {
  const [records, setRecords] = useState<Grammar[]>([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    const result = await adminOperationsRepository.listGrammar();
    if (result.ok) setRecords(result.data); else setError(result.error.message);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => records.filter((item) => (level === "all" || item.jlpt_level === level) && (!query || `${item.pattern} ${item.meaning} ${item.formation} ${item.nuance}`.toLowerCase().includes(query.toLowerCase()))), [level, query, records]);
  const archived = records.filter((item) => item.archived_at).length;
  const needsReview = records.filter((item) => item.quality_status === "needs_review" || item.quality_status === "rejected").length;
  return <>
    <InspectorHeader title="Grammar library" description="Live permanent grammar records. Production editing is intentionally disabled until a normalized server-side authoring API is available." loading={loading} onRefresh={load} />
    <ErrorBanner error={error} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminStatCard label="Records" value={records.length} /><AdminStatCard label="Archived" value={archived} tone="blue" /><AdminStatCard label="Needs review" value={needsReview} tone={needsReview ? "orange" : "teal"} /><AdminStatCard label="Verified" value={records.filter((item) => item.quality_status === "verified").length} /></div>
    <Filters query={query} setQuery={setQuery} level={level} setLevel={setLevel} placeholder="Pattern, meaning, formation, nuance" />
    <ReadOnlyNotice />
    {loading && !records.length ? <Skeleton /> : visible.length ? <AdminTable caption="Live grammar records" headers={["Pattern", "Level", "Meaning", "Formation", "Quality", "Source", "Usage", "Archived"]} rows={visible.map((item) => ({ id: item.id, cells: [<strong key="pattern" className="text-teal-800">{item.pattern}</strong>, item.jlpt_level, item.meaning, item.formation, <AdminStatus key="quality">{item.quality_status}</AdminStatus>, item.source_type, item.usage_count, item.archived_at ? new Date(item.archived_at).toLocaleDateString() : "—"] }))} /> : <AdminEmptyState title="No grammar records" description="No records match the current filters." />}
  </>;
}

export function LiveVocabularyInspector() {
  const [tab, setTab] = useState<"kanji" | "vocabulary">("kanji");
  const [kanji, setKanji] = useState<Kanji[]>([]);
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    const [kanjiResult, vocabularyResult] = await Promise.all([adminOperationsRepository.listKanji(), adminOperationsRepository.listVocabulary()]);
    if (kanjiResult.ok) setKanji(kanjiResult.data); else setError(kanjiResult.error.message);
    if (vocabularyResult.ok) setVocabulary(vocabularyResult.data); else setError((current) => current || vocabularyResult.error.message);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  const visibleKanji = useMemo(() => kanji.filter((item) => (level === "all" || item.jlpt_level === level) && (!query || `${item.character} ${item.meanings.join(" ")} ${item.readings.join(" ")}`.toLowerCase().includes(query.toLowerCase()))), [kanji, level, query]);
  const visibleVocabulary = useMemo(() => vocabulary.filter((item) => (level === "all" || item.jlpt_level === level) && (!query || `${item.written_form} ${item.reading} ${item.meaning} ${item.part_of_speech}`.toLowerCase().includes(query.toLowerCase()))), [level, query, vocabulary]);
  const current = tab === "kanji" ? kanji : vocabulary;
  return <>
    <InspectorHeader title="Kanji & vocabulary library" description="Live permanent Japanese reference records, provenance, quality state, and reuse counts." loading={loading} onRefresh={load} />
    <ErrorBanner error={error} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminStatCard label="Kanji" value={kanji.length} /><AdminStatCard label="Vocabulary" value={vocabulary.length} tone="blue" /><AdminStatCard label="Needs review" value={[...kanji, ...vocabulary].filter((item) => item.quality_status === "needs_review").length} tone="orange" /><AdminStatCard label="Archived" value={[...kanji, ...vocabulary].filter((item) => item.archived_at).length} /></div>
    <div className="mt-6 flex gap-2" role="tablist">{(["kanji", "vocabulary"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-11 rounded-xl px-5 text-sm font-bold capitalize ${tab === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white"}`}>{item}</button>)}</div>
    <Filters query={query} setQuery={setQuery} level={level} setLevel={setLevel} placeholder={`Search ${tab}`} />
    <ReadOnlyNotice />
    {loading && !current.length ? <Skeleton /> : tab === "kanji" ? visibleKanji.length ? <AdminTable caption="Live kanji records" headers={["Character", "Level", "Meanings", "Readings", "Strokes", "Quality", "Source", "Usage", "Archived"]} rows={visibleKanji.map((item) => ({ id: item.id, cells: [<strong key="char" className="text-2xl text-teal-800">{item.character}</strong>, item.jlpt_level, item.meanings.join(", ") || "Missing", item.readings.join(", ") || "Missing", item.stroke_count, <AdminStatus key="quality">{item.quality_status}</AdminStatus>, item.source_type, item.usage_count, item.archived_at ? new Date(item.archived_at).toLocaleDateString() : "—"] }))} /> : <AdminEmptyState title="No kanji records" description="No records match the current filters." /> : visibleVocabulary.length ? <AdminTable caption="Live vocabulary records" headers={["Written", "Reading", "Meaning", "Part of speech", "Level", "Quality", "Source", "Usage", "Archived"]} rows={visibleVocabulary.map((item) => ({ id: item.id, cells: [<strong key="written" className="text-teal-800">{item.written_form}</strong>, item.reading, item.meaning, item.part_of_speech, item.jlpt_level, <AdminStatus key="quality">{item.quality_status}</AdminStatus>, item.source_type, item.usage_count, item.archived_at ? new Date(item.archived_at).toLocaleDateString() : "—"] }))} /> : <AdminEmptyState title="No vocabulary records" description="No records match the current filters." />}
  </>;
}

export function LiveCurriculumInspector() {
  const [data, setData] = useState<CurriculumInspectorData | null>(null);
  const [levelId, setLevelId] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    const result = await adminContentInspectorRepository.loadCurriculum();
    if (result.ok) setData(result.data); else setError(result.error.message);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  const levelById = useMemo(() => new Map((data?.levels ?? []).map((item) => [item.id, item])), [data]);
  const visible = useMemo(() => (data?.items ?? []).filter((item) => (levelId === "all" || item.curriculum_level_id === levelId) && (!query || `${item.label} ${item.item_type}`.toLowerCase().includes(query.toLowerCase()))), [data, levelId, query]);
  const required = (data?.items ?? []).filter((item) => item.required).length;
  const prerequisiteGaps = (data?.items ?? []).filter((item) => item.prerequisite_ids.some((id) => !(data?.items ?? []).some((candidate) => candidate.id === id))).length;
  return <>
    <InspectorHeader title="Curriculum management" description="Live JLPT curriculum levels and prerequisite graph. Editing remains demo-only until curriculum mutations receive a dedicated server-authoring API." loading={loading} onRefresh={load} />
    <ErrorBanner error={error} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminStatCard label="Levels" value={data?.levels.length ?? 0} /><AdminStatCard label="Curriculum items" value={data?.items.length ?? 0} tone="blue" /><AdminStatCard label="Required items" value={required} /><AdminStatCard label="Prerequisite gaps" value={prerequisiteGaps} tone={prerequisiteGaps ? "red" : "teal"} /></div>
    <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_14rem]"><SearchInput query={query} setQuery={setQuery} placeholder="Concept or item type" /><select aria-label="Curriculum level" value={levelId} onChange={(event) => setLevelId(event.target.value)} className="admin-input"><option value="all">All levels</option>{(data?.levels ?? []).map((item) => <option key={item.id} value={item.id}>{item.jlpt_level} · {item.title}</option>)}</select></div>
    <ReadOnlyNotice />
    {loading && !data ? <Skeleton /> : visible.length ? <AdminTable caption="Live curriculum items" headers={["Order", "Level", "Concept", "Type", "Required", "Prerequisites", "Archived"]} rows={visible.map((item) => ({ id: item.id, cells: [item.sequence_order, levelById.get(item.curriculum_level_id)?.jlpt_level ?? "—", <strong key="label" className="text-teal-800">{item.label}</strong>, item.item_type, <AdminStatus key="required">{item.required ? "required" : "optional"}</AdminStatus>, item.prerequisite_ids.join(", ") || "None", item.archived_at ? new Date(item.archived_at).toLocaleDateString() : "—"] }))} /> : <AdminEmptyState title="No curriculum items" description="No records match the current filters." />}
    {data && <div className="mt-6"><AdminSection title="Published lesson coverage by JLPT" description="Counts published canonical lessons at each level; this does not invent concept-to-lesson coverage where no normalized relationship exists."><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{levels.map((level) => <div key={level} className="rounded-xl bg-slate-50 p-4"><span className="text-xs font-semibold text-slate-500">{level}</span><strong className="mt-1 block text-2xl">{data.lessons.filter((lesson) => lesson.jlpt_level === level && lesson.status === "published").length}</strong></div>)}</div></AdminSection></div>}
  </>;
}

export function LiveImageInspector() {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() { setLoading(true); setError(""); const result = await adminOperationsRepository.listImages(); if (result.ok) setAssets(result.data); else setError(result.error.message); setLoading(false); }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => assets.filter((item) => !query || `${item.description} ${item.topic_tags.join(" ")} ${item.vocabulary_tags.join(" ")} ${item.storage_path}`.toLowerCase().includes(query.toLowerCase())), [assets, query]);
  return <>
    <InspectorHeader title="Image library" description="Live image-asset metadata and storage paths. Browser-side mock metadata editing is disabled in production." loading={loading} onRefresh={load} />
    <ErrorBanner error={error} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminStatCard label="Assets" value={assets.length} /><AdminStatCard label="Active" value={assets.filter((item) => item.status === "active" && !item.archived_at).length} tone="blue" /><AdminStatCard label="Needs metadata" value={assets.filter((item) => !item.description || !item.topic_tags.length).length} tone="orange" /><AdminStatCard label="Archived" value={assets.filter((item) => item.archived_at).length} /></div>
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"><SearchInput query={query} setQuery={setQuery} placeholder="Description, tags, or storage path" /></div><ReadOnlyNotice />
    {loading && !assets.length ? <Skeleton /> : visible.length ? <AdminTable caption="Live image assets" headers={["Description", "Level", "Status", "Quality", "Topics", "Vocabulary tags", "Storage path", "Source"]} rows={visible.map((item) => ({ id: item.id, cells: [item.description || "Missing description", item.jlpt_level, <AdminStatus key="status">{item.status}</AdminStatus>, `${item.quality_score}/100`, item.topic_tags.join(", ") || "None", item.vocabulary_tags.join(", ") || "None", <code key="path" className="text-xs">{item.storage_path}</code>, item.creation_source] }))} /> : <AdminEmptyState title="No image assets" description="No image records match the current search." />}
  </>;
}

export function LiveAudioInspector() {
  const [assets, setAssets] = useState<AudioAsset[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() { setLoading(true); setError(""); const result = await adminOperationsRepository.listAudio(); if (result.ok) setAssets(result.data); else setError(result.error.message); setLoading(false); }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => assets.filter((item) => !query || `${item.japanese_text} ${item.voice} ${item.speaking_style} ${item.storage_path}`.toLowerCase().includes(query.toLowerCase())), [assets, query]);
  return <>
    <InspectorHeader title="Audio library" description="Live persisted lesson audio metadata. This screen does not fabricate playback quality or storage size metrics." loading={loading} onRefresh={load} />
    <ErrorBanner error={error} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminStatCard label="Assets" value={assets.length} /><AdminStatCard label="Active" value={assets.filter((item) => item.status === "active" && !item.archived_at).length} tone="blue" /><AdminStatCard label="Duration" value={`${Math.round(assets.reduce((sum, item) => sum + item.duration_seconds, 0))}s`} /><AdminStatCard label="Archived" value={assets.filter((item) => item.archived_at).length} /></div>
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"><SearchInput query={query} setQuery={setQuery} placeholder="Japanese text, voice, style, or storage path" /></div><ReadOnlyNotice />
    {loading && !assets.length ? <Skeleton /> : visible.length ? <AdminTable caption="Live audio assets" headers={["Japanese text", "Voice", "Style", "Duration", "Speed", "Status", "Storage path"]} rows={visible.map((item) => ({ id: item.id, cells: [<span key="text" className="block max-w-80 truncate">{item.japanese_text}</span>, item.voice, item.speaking_style, `${item.duration_seconds}s`, `${item.playback_speed}×`, <AdminStatus key="status">{item.status}</AdminStatus>, <code key="path" className="text-xs">{item.storage_path}</code>] }))} /> : <AdminEmptyState title="No audio assets" description="No audio records match the current search." />}
  </>;
}

function InspectorHeader({ title, description, loading, onRefresh }: { title: string; description: string; loading: boolean; onRefresh: () => Promise<void> }) {
  return <AdminPageHeader eyebrow="Live production data" title={title} description={description} actions={<Button type="button" variant="secondary" className="rounded-xl" disabled={loading} onClick={() => void onRefresh()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>} />;
}
function Filters({ query, setQuery, level, setLevel, placeholder }: { query: string; setQuery: (value: string) => void; level: string; setLevel: (value: string) => void; placeholder: string }) { return <div className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_12rem]"><SearchInput query={query} setQuery={setQuery} placeholder={placeholder} /><select aria-label="JLPT level" value={level} onChange={(event) => setLevel(event.target.value)} className="admin-input"><option value="all">All levels</option>{levels.map((item) => <option key={item}>{item}</option>)}</select></div>; }
function SearchInput({ query, setQuery, placeholder }: { query: string; setQuery: (value: string) => void; placeholder: string }) { return <label className="relative"><span className="sr-only">Search</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder={placeholder} /></label>; }
function ReadOnlyNotice() { return <div className="my-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"><strong>Production-safe mode:</strong> this page reads live Supabase records. Local copy/archive/edit buttons are intentionally unavailable because they did not persist to the backend.</div>; }
function ErrorBanner({ error }: { error: string }) { return error ? <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null; }
function Skeleton() { return <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />; }
