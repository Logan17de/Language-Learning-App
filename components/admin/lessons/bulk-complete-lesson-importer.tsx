"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  CheckCircle2,
  Clipboard,
  FileJson2,
  Headphones,
  LoaderCircle,
  RefreshCw,
  Send,
  Upload,
} from "lucide-react";
import {
  parseCompleteLessonBatch,
  validateCompleteLessonBatch,
} from "@/lib/admin-complete-lesson-bulk-import";
import { COMPLETE_LESSON_CHAT_PROMPT } from "@/lib/admin-complete-lesson-prompt";
import { adminBulkLessonImportRepository } from "@/lib/repositories/admin-bulk-lesson-import-repository";
import {
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

type TtsBatch = {
  id: string;
  status: string;
  trigger_source: string;
  lesson_count: number;
  processed_count: number;
  ready_count: number;
  failed_count: number;
  generated_audio_count: number;
  reused_audio_count: number;
  linked_audio_count: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type TtsOverview = {
  pendingCount: number;
  automaticBatchSize: number;
  batches: TtsBatch[];
};

const emptyTts: TtsOverview = {
  pendingCount: 0,
  automaticBatchSize: 100,
  batches: [],
};

export function BulkCompleteLessonImporter() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState("");
  const [publish, setPublish] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingTts, setSendingTts] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [tts, setTts] = useState<TtsOverview>(emptyTts);
  const [ttsError, setTtsError] = useState("");

  const parsed = useMemo(() => {
    if (!source.trim()) return { lessons: [] as unknown[], error: "" };
    try {
      return { lessons: parseCompleteLessonBatch(source), error: "" };
    } catch (error) {
      return {
        lessons: [] as unknown[],
        error: error instanceof Error ? error.message : "The lesson upload could not be parsed.",
      };
    }
  }, [source]);
  const validation = useMemo(
    () => validateCompleteLessonBatch(parsed.lessons),
    [parsed.lessons],
  );

  const loadTts = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/audio/batches", { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("TTS queue could not be loaded.");
      }
      const value = payload as Record<string, unknown>;
      setTts({
        pendingCount: typeof value.pendingCount === "number" ? value.pendingCount : 0,
        automaticBatchSize:
          typeof value.automaticBatchSize === "number" ? value.automaticBatchSize : 100,
        batches: Array.isArray(value.batches) ? value.batches as TtsBatch[] : [],
      });
      setTtsError("");
    } catch (error) {
      setTtsError(error instanceof Error ? error.message : "TTS queue could not be loaded.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTts]);

  useEffect(() => {
    const active = tts.batches.some(
      (batch) => batch.status === "queued" || batch.status === "processing",
    );
    if (!active) return;
    const timer = window.setInterval(() => void loadTts(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadTts, tts.batches]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 24 * 1024 * 1024) {
      setMessage("Use a JSON, JSONL, or TXT upload smaller than 24 MB.");
      event.target.value = "";
      return;
    }
    setSource(await file.text());
    setMessage(`Loaded ${file.name}.`);
    event.target.value = "";
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(COMPLETE_LESSON_CHAT_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  async function kickAutomaticTtsWorker() {
    const response = await fetch("/api/admin/audio/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processNext: true }),
    });
    if (!response.ok) {
      throw new Error("Lessons were imported, but the automatic TTS worker could not be started. You can start it manually below.");
    }
  }

  async function submit() {
    if (!validation.valid || submitting) return;
    setSubmitting(true);
    setMessage("");
    setTtsError("");
    try {
      // The large lesson payload goes straight from this authenticated owner
      // session to Supabase. It does not pass through a Vercel request body.
      const result = await adminBulkLessonImportRepository.importMany(
        parsed.lessons,
        publish,
      );
      if (!result.ok) throw new Error(result.error.message);

      setMessage(
        `${result.data.count} lesson${result.data.count === 1 ? "" : "s"} imported directly into Supabase${publish ? " and published" : " as draft"}. Listening TTS was added to the durable queue.`,
      );

      // If this upload crossed the 100-pending threshold the database already
      // created the batch. This tiny app request only starts its server worker.
      try {
        await kickAutomaticTtsWorker();
      } catch (error) {
        setTtsError(error instanceof Error ? error.message : "Automatic TTS could not be started.");
      }
      await loadTts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lessons could not be imported.");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendPendingTts() {
    if (tts.pendingCount < 1 || sendingTts) return;
    setSendingTts(true);
    setTtsError("");
    try {
      const response = await fetch("/api/admin/audio/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: Math.min(tts.pendingCount, 100) }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const body = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "TTS batch could not be started.");
      }
      setMessage(`TTS batch ${typeof body.batchId === "string" ? body.batchId : ""} started.`.trim());
      await loadTts();
    } catch (error) {
      setTtsError(error instanceof Error ? error.message : "TTS batch could not be started.");
    } finally {
      setSendingTts(false);
    }
  }

  const uploadReady = source.trim().length > 0 && !parsed.error;
  return (
    <>
      <AdminPageHeader
        eyebrow="Bulk lesson ingestion"
        title="Upload complete AIko lessons directly to the database"
        description="Use the same canonical schema for one lesson or one hundred. Validated lessons go directly to the authenticated Supabase transaction, and listening audio enters the reusable TTS queue automatically."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,.75fr)]">
        <div className="space-y-6">
          <AdminSection
            title="Lesson upload"
            description="Accepted: one JSON object, a JSON array containing 1–100 lessons, or JSONL with one complete lesson per line."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" className="rounded-xl" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> Choose file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.jsonl,.txt,application/json,text/plain"
                className="hidden"
                onChange={(event) => void chooseFile(event)}
              />
              <span className="text-xs text-slate-500">Maximum 100 lessons / 24 MB per upload</span>
            </div>

            <textarea
              value={source}
              onChange={(event) => { setSource(event.target.value); setMessage(""); }}
              rows={18}
              spellCheck={false}
              placeholder='[{"schemaVersion":1,"id":"lesson_n5_...", ...}]'
              className="mt-5 w-full resize-y rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              aria-label="Complete lesson JSON, array, or JSONL"
            />

            {source.trim() && (
              <div className={`mt-4 rounded-xl border p-4 ${validation.valid ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-center gap-2">
                  {validation.valid ? <CheckCircle2 className="size-5 text-emerald-700" /> : <FileJson2 className="size-5 text-amber-700" />}
                  <strong>{parsed.error || (validation.valid ? `${validation.count} lesson${validation.count === 1 ? "" : "s"} ready` : `${validation.validCount}/${validation.count} lessons valid`)}</strong>
                </div>
                {!parsed.error && validation.issues.length > 0 && (
                  <div className="mt-3 max-h-52 space-y-3 overflow-y-auto text-sm text-amber-900">
                    {validation.issues.slice(0, 12).map((issue) => (
                      <div key={`${issue.index}:${issue.id}`}>
                        <strong>Lesson {issue.index + 1}{issue.id ? ` · ${issue.id}` : ""}</strong>
                        <ul className="mt-1 list-disc pl-5">
                          {issue.errors.slice(0, 5).map((error) => <li key={error}>{error}</li>)}
                        </ul>
                      </div>
                    ))}
                    {validation.issues.length > 12 && <p>+ {validation.issues.length - 12} more invalid lesson(s)</p>}
                  </div>
                )}
              </div>
            )}

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} className="mt-0.5 size-4 accent-teal-700" />
              <span>
                <strong className="block text-sm">Publish immediately</strong>
                <span className="mt-1 block text-xs leading-5 text-slate-500">Off = store every lesson as a draft. On = make every imported lesson available to the assignment engine after the transaction succeeds.</span>
              </span>
            </label>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button type="button" className="rounded-xl" disabled={!uploadReady || !validation.valid || submitting} onClick={() => void submit()}>
                {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {submitting ? "Importing…" : `Import ${validation.count || ""} lesson${validation.count === 1 ? "" : "s"}`.trim()}
              </Button>
              <Button type="button" variant="secondary" className="rounded-xl" onClick={() => void copyPrompt()}>
                {copied ? <CheckCircle2 className="size-4" /> : <Clipboard className="size-4" />}
                {copied ? "Prompt copied" : "Copy lesson-format prompt"}
              </Button>
            </div>
            {message && <p role="status" className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">{message}</p>}
          </AdminSection>

          <AdminSection
            title="Listening TTS batches"
            description="Each lesson contributes only its Listening transcripts. Identical audio is reused from the existing audio library instead of synthesized twice."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Pending lessons" value={tts.pendingCount} />
              <Metric label="Automatic send" value={`${tts.automaticBatchSize} lessons`} />
              <Metric label="Clips / full batch" value="up to 500" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" className="rounded-xl" disabled={tts.pendingCount < 1 || sendingTts} onClick={() => void sendPendingTts()}>
                {sendingTts ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send pending TTS now ({Math.min(tts.pendingCount, 100)})
              </Button>
              <Button type="button" variant="secondary" className="rounded-xl" onClick={() => void loadTts()}>
                <RefreshCw className="size-4" /> Refresh
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              When the pending count reaches 100, the database creates the batch automatically and the importer sends only a lightweight worker-start request. Manual send works with any pending count from 1 to 100.
            </p>
            {ttsError && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{ttsError}</p>}

            <div className="mt-5 space-y-3">
              {tts.batches.slice(0, 6).map((batch) => (
                <div key={batch.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><Headphones className="size-4 text-teal-700" /><strong className="text-sm">{batch.lesson_count} lessons · {batch.trigger_source}</strong></div>
                    <AdminStatus>{batch.status}</AdminStatus>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {batch.processed_count}/{batch.lesson_count} processed · {batch.generated_audio_count} generated · {batch.reused_audio_count} reused · {batch.linked_audio_count} linked
                  </p>
                  {batch.error_message && <p className="mt-2 text-xs text-red-600">{batch.error_message}</p>}
                </div>
              ))}
              {!tts.batches.length && <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">No TTS batches yet.</p>}
            </div>
          </AdminSection>
        </div>

        <AdminSection
          title="Canonical lesson format"
          description="Every element in a bulk file uses the exact same schemaVersion 1 contract already understood by AIko."
          className="xl:sticky xl:top-24 xl:self-start"
        >
          <div className="space-y-3 text-sm leading-6 text-slate-600">
            <p><strong>Story:</strong> 10–15 sentences.</p>
            <p><strong>Targets:</strong> exactly 5 kanji + 3 grammar patterns.</p>
            <p><strong>Vocabulary practice:</strong> 13 questions (6 Easy / 4 Medium / 3 Hard).</p>
            <p><strong>Grammar:</strong> 10 questions (3 / 4 / 3).</p>
            <p><strong>Speaking:</strong> 5 read-aloud items (2 / 2 / 1).</p>
            <p><strong>Reading:</strong> 10–15 sentences + 5 questions.</p>
            <p><strong>Listening:</strong> 5 conversations, 5–10 lines each.</p>
            <p><strong>Review:</strong> 5 questions covering kanji, vocabulary, grammar, listening, and speaking.</p>
          </div>
          <Button type="button" variant="secondary" className="mt-5 w-full rounded-xl" onClick={() => void copyPrompt()}>
            <Clipboard className="size-4" /> Copy exact generator prompt
          </Button>
          <p className="mt-4 text-xs leading-5 text-slate-500">For a 100-lesson JSON array, repeat this exact object shape 100 times with unique lesson IDs. The authenticated importer writes directly through Supabase RPC and normalizes each package into its canonical lesson/version/activity tables.</p>
        </AdminSection>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-slate-50 p-4"><span className="text-xs font-semibold text-slate-500">{label}</span><strong className="mt-1 block text-2xl text-slate-900">{value}</strong></div>;
}
