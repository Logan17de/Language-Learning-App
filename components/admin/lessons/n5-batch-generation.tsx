"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  FilePenLine,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import {
  AdminPageHeader,
  AdminSection,
  AdminStatCard,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

type BatchSummary = {
  id: string;
  jlptLevel: string;
  requestedCount: number;
  model: string;
  status: string;
  providerBatchId: string | null;
  createdAt: string;
  submittedAt: string | null;
  lastSyncedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  counts: Record<string, number>;
};

type RequestSummary = {
  id: string;
  customId: string;
  sequenceNumber: number;
  targetKanji: string[];
  targetGrammar: string[];
  status: string;
  validationErrors: string[];
  importError: string | null;
  manuallyFixed: boolean;
};

type BatchDetail = {
  batch: BatchSummary;
  requests: RequestSummary[];
};

type StagedRequest = Record<string, unknown> & {
  id?: string;
  generation_batch_id?: string;
  custom_id?: string;
  status?: string;
  raw_response?: string | null;
  parsed_lesson?: unknown;
  edited_lesson?: unknown;
  validation_errors?: string[];
  target_kanji?: string[];
  target_grammar?: string[];
  import_error?: string | null;
};

const jlptLevels = ["N5", "N4", "N3", "N2", "N1"] as const;
type JlptLevel = (typeof jlptLevels)[number];

async function jsonRequest(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const payload: unknown = await response.json().catch(() => null);
  const body = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "The operation failed.");
  }
  return body;
}

function pretty(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function JLPTBatchGenerationWorkspace() {
  const [level, setLevel] = useState<JlptLevel>("N5");
  const [count, setCount] = useState(100);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedRequest | null>(null);
  const [editor, setEditor] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadBatches = useCallback(async () => {
    const body = await jsonRequest("/api/admin/lesson-generation", { cache: "no-store" });
    const rows = Array.isArray(body.batches) ? body.batches as BatchSummary[] : [];
    setBatches(rows);
    setSelectedBatchId((current) => current ?? rows[0]?.id ?? null);
  }, []);

  const loadDetail = useCallback(async (batchId: string) => {
    const body = await jsonRequest(`/api/admin/lesson-generation?batchId=${encodeURIComponent(batchId)}`, { cache: "no-store" });
    setDetail(body as unknown as BatchDetail);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadBatches();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Generation batches could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [loadBatches]);

  useEffect(() => {
    let active = true;
    // State updates land in a promise callback rather than synchronously in
    // the effect body, so the initial load cannot cascade renders.
    void Promise.resolve().then(() => { if (active) return refresh(); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    // Clearing and loading both happen off the synchronous effect body.
    void Promise.resolve().then(() => {
      if (!active) return;
      if (!selectedBatchId) {
        setDetail(null);
        return;
      }
      return loadDetail(selectedBatchId).catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Batch detail could not be loaded.");
      });
    });
    return () => { active = false; };
  }, [loadDetail, selectedBatchId]);

  async function createBatch() {
    setWorking("create"); setMessage(""); setError("");
    try {
      const body = await jsonRequest("/api/admin/lesson-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", count, level }),
      });
      const batchId = typeof body.batchId === "string" ? body.batchId : null;
      setMessage(`${count} ${level} lesson requests with unique kanji sets and balanced grammar targets were submitted to OpenAI Batch.`);
      await loadBatches();
      if (batchId) {
        setSelectedBatchId(batchId);
        await loadDetail(batchId);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Batch could not be created.");
    } finally {
      setWorking("");
    }
  }

  async function syncBatch(batchId: string) {
    setWorking(`sync:${batchId}`); setMessage(""); setError("");
    try {
      await jsonRequest("/api/admin/lesson-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", batchId }),
      });
      setMessage("OpenAI Batch state and available output files were synced. Raw output was stored before validation.");
      await Promise.all([loadBatches(), loadDetail(batchId)]);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Batch could not be synced.");
    } finally {
      setWorking("");
    }
  }

  async function importValid(batchId: string) {
    setWorking(`import:${batchId}`); setMessage(""); setError("");
    try {
      const body = await jsonRequest("/api/admin/lesson-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_valid", batchId }),
      });
      setMessage(`${Number(body.imported ?? 0)} valid lesson(s) imported and published; ${Number(body.failed ?? 0)} import(s) need attention.`);
      await Promise.all([loadBatches(), loadDetail(batchId)]);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Valid lessons could not be imported.");
    } finally {
      setWorking("");
    }
  }

  async function openRequest(requestId: string) {
    setSelectedRequestId(requestId); setWorking(`open:${requestId}`); setError("");
    try {
      const body = await jsonRequest(`/api/admin/lesson-generation/requests/${encodeURIComponent(requestId)}`, { cache: "no-store" });
      const request = body.request as StagedRequest;
      setStaged(request);
      setEditor(
        pretty(request.edited_lesson) ||
        pretty(request.parsed_lesson) ||
        (typeof request.raw_response === "string" ? request.raw_response : ""),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Generated lesson could not be opened.");
    } finally {
      setWorking("");
    }
  }

  async function saveRepair() {
    if (!selectedRequestId) return;
    setWorking(`save:${selectedRequestId}`); setMessage(""); setError("");
    try {
      const body = await jsonRequest(`/api/admin/lesson-generation/requests/${encodeURIComponent(selectedRequestId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson: editor }),
      });
      const errors = Array.isArray(body.errors) ? body.errors as string[] : [];
      setMessage(body.status === "valid"
        ? "Manual repair passes the complete lesson validator. The original model output is still preserved separately."
        : `Manual repair saved with ${errors.length} validation issue(s).`);
      await openRequest(selectedRequestId);
      if (selectedBatchId) await Promise.all([loadBatches(), loadDetail(selectedBatchId)]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Manual repair could not be saved.");
    } finally {
      setWorking("");
    }
  }

  async function importOne() {
    if (!selectedRequestId) return;
    setWorking(`import-one:${selectedRequestId}`); setMessage(""); setError("");
    try {
      const body = await jsonRequest(`/api/admin/lesson-generation/requests/${encodeURIComponent(selectedRequestId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import" }),
      });
      setMessage(`${Number(body.imported ?? 0)} lesson imported and published.`);
      await openRequest(selectedRequestId);
      if (selectedBatchId) await Promise.all([loadBatches(), loadDetail(selectedBatchId)]);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Lesson could not be imported.");
    } finally {
      setWorking("");
    }
  }

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? detail?.batch ?? null,
    [batches, detail, selectedBatchId],
  );
  const totalValid = selectedBatch?.counts.valid ?? 0;
  const totalInvalid = selectedBatch?.counts.invalid ?? 0;
  const totalImported = selectedBatch?.counts.imported ?? 0;
  const totalFailed = selectedBatch?.counts.api_failed ?? 0;

  return <>
    <AdminPageHeader
      eyebrow="Offline content factory"
      title="Generate JLPT lesson batches"
      description="Choose N5 through N1 and a lesson count. AIko keeps each 5-kanji set unique for that level. Each lesson gets 3 distinct grammar patterns, selected with preference for the least-used patterns in generation history so grammar stays balanced while still being reusable across different kanji sets. OpenAI chooses each topic."
    />

    {error && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"><AlertTriangle className="mt-0.5 size-5 shrink-0" />{error}</div>}
    {message && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 size-5 shrink-0" />{message}</div>}

    <div className="grid gap-6 xl:grid-cols-[23rem_minmax(0,1fr)]">
      <div className="space-y-6">
        <AdminSection title="Create lesson batch" description="Choose the JLPT level and how many complete lessons to generate in this OpenAI Batch request.">
          <label className="text-sm font-bold text-slate-700" htmlFor="jlpt-batch-level">JLPT level</label>
          <select id="jlpt-batch-level" value={level} onChange={(event) => setLevel(event.target.value as JlptLevel)} className="admin-input mt-2 w-full">
            {jlptLevels.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>

          <label className="mt-4 block text-sm font-bold text-slate-700" htmlFor="jlpt-batch-count">Lessons</label>
          <input id="jlpt-batch-count" type="number" min={1} max={100} value={count} onChange={(event) => setCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} className="admin-input mt-2 w-full" />
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            <strong className="block text-slate-900">Per lesson</strong>
            5 random {level} kanji in a DB-unique set · 3 distinct {level} grammar patterns balanced by prior usage · AI-selected topic · complete canonical lesson package.
          </div>
          <Button type="button" className="mt-4 w-full rounded-xl" disabled={working === "create"} onClick={() => void createBatch()}>
            {working === "create" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Submit {count} {level} to Batch API
          </Button>
        </AdminSection>

        <AdminSection title="Generation batches" description="Select a batch to inspect its individual lesson targets and results.">
          <Button type="button" variant="secondary" className="mb-3 w-full rounded-xl" disabled={loading} onClick={() => void refresh()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh DB</Button>
          <div className="max-h-[36rem] space-y-2 overflow-y-auto">
            {batches.map((batch) => <button key={batch.id} type="button" onClick={() => { setSelectedBatchId(batch.id); setSelectedRequestId(null); setStaged(null); }} className={`w-full rounded-xl border p-3 text-left transition ${selectedBatchId === batch.id ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className="flex items-center justify-between gap-2"><strong className="text-sm">{batch.requestedCount} · {batch.jlptLevel}</strong><AdminStatus>{batch.status}</AdminStatus></div>
              <p className="mt-2 text-xs text-slate-500">{new Date(batch.createdAt).toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500">{batch.counts.imported ?? 0} imported · {batch.counts.valid ?? 0} valid · {batch.counts.invalid ?? 0} invalid · {batch.counts.api_failed ?? 0} API failed</p>
            </button>)}
            {!loading && !batches.length && <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">No offline lesson batches yet.</p>}
          </div>
        </AdminSection>
      </div>

      <div className="space-y-6">
        {selectedBatch ? <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard label="Imported" value={totalImported} />
            <AdminStatCard label="Ready" value={totalValid} tone="blue" />
            <AdminStatCard label="Invalid" value={totalInvalid} tone={totalInvalid ? "orange" : "teal"} />
            <AdminStatCard label="API failed" value={totalFailed} tone={totalFailed ? "red" : "teal"} />
          </div>

          <AdminSection title="Batch controls" description={`${selectedBatch.jlptLevel} · Provider ${selectedBatch.providerBatchId ?? "not submitted"} · model ${selectedBatch.model}`}>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="rounded-xl" disabled={!selectedBatch.providerBatchId || working.startsWith("sync:")} onClick={() => void syncBatch(selectedBatch.id)}>
                {working === `sync:${selectedBatch.id}` ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Sync OpenAI results
              </Button>
              <Button type="button" variant="secondary" className="rounded-xl" disabled={totalValid < 1 || working.startsWith("import:")} onClick={() => void importValid(selectedBatch.id)}>
                {working === `import:${selectedBatch.id}` ? <LoaderCircle className="size-4 animate-spin" /> : <Database className="size-4" />}Import all valid ({totalValid})
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">OpenAI Batch can complete asynchronously. Sync downloads both output and error files, stores each full JSONL line first, then validates. Invalid output is never discarded.</p>
            {selectedBatch.errorMessage && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{selectedBatch.errorMessage}</p>}
          </AdminSection>

          <AdminSection title="Lesson requests" description="Every five-kanji set must be new for that JLPT level. Grammar patterns can reappear with different kanji sets, but selection favors the least-used patterns so coverage remains balanced.">
            <div className="max-h-[40rem] space-y-2 overflow-y-auto">
              {(detail?.requests ?? []).map((request) => <button key={request.id} type="button" onClick={() => void openRequest(request.id)} className={`w-full rounded-xl border p-3 text-left ${selectedRequestId === request.id ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">#{request.sequenceNumber} · {request.targetKanji.join(" ")}</strong><AdminStatus>{request.status}</AdminStatus></div>
                <p className="mt-1 text-xs text-slate-600">{request.targetGrammar.join(" · ")}</p>
                {request.validationErrors.length > 0 && <p className="mt-2 truncate text-xs font-semibold text-orange-700">{request.validationErrors[0]}</p>}
                {request.importError && <p className="mt-2 truncate text-xs font-semibold text-red-700">Import: {request.importError}</p>}
              </button>)}
            </div>
          </AdminSection>
        </> : <AdminSection title="Select a batch" description="Create or select a JLPT generation batch to inspect its target combinations and provider results."><div className="grid place-items-center py-16 text-center text-slate-400"><Bot className="size-10" /><p className="mt-3 text-sm">No batch selected.</p></div></AdminSection>}

        {staged && selectedRequestId && <AdminSection title={`Repair ${String(staged.custom_id ?? "generated lesson")}`} description={`Targets are locked: ${(staged.target_kanji ?? []).join(" ")} · ${(staged.target_grammar ?? []).join(" / ")}. Saving a repair never overwrites the raw model response.`}>
          <div className="mb-4 flex flex-wrap items-center gap-2"><AdminStatus>{String(staged.status ?? "unknown")}</AdminStatus>{staged.edited_lesson ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">manual copy exists</span> : null}</div>
          {Array.isArray(staged.validation_errors) && staged.validation_errors.length > 0 && <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4"><strong className="text-sm text-orange-900">Validation issues</strong><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-orange-800">{staged.validation_errors.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          <label htmlFor="lesson-repair-json" className="text-sm font-bold text-slate-700">Editable lesson JSON</label>
          <textarea id="lesson-repair-json" value={editor} onChange={(event) => setEditor(event.target.value)} rows={24} spellCheck={false} className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-teal-400" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" className="rounded-xl" disabled={working === `save:${selectedRequestId}`} onClick={() => void saveRepair()}>{working === `save:${selectedRequestId}` ? <LoaderCircle className="size-4 animate-spin" /> : <FilePenLine className="size-4" />}Save + validate</Button>
            <Button type="button" variant="secondary" className="rounded-xl" disabled={staged.status !== "valid" || working === `import-one:${selectedRequestId}`} onClick={() => void importOne()}>{working === `import-one:${selectedRequestId}` ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}Import this lesson</Button>
          </div>
          <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">Original raw model response</summary>
            <p className="mt-2 text-xs text-slate-500">Read-only. This value is kept even after manual repair.</p>
            <textarea readOnly value={typeof staged.raw_response === "string" ? staged.raw_response : "No model text was returned. Check the stored provider error for this request."} rows={14} className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs leading-5 text-slate-600" />
          </details>
        </AdminSection>}
      </div>
    </div>
  </>;
}
