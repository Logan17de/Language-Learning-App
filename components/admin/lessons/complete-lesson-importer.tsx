"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clipboard,
  FileJson2,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  parseCompleteLessonImport,
  validateCompleteLessonImport,
  type CompleteLessonCounts,
} from "@/lib/admin-complete-lesson-import";
import { COMPLETE_LESSON_CHAT_PROMPT } from "@/lib/admin-complete-lesson-prompt";
import { AdminPageHeader } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

type ImportResult = {
  lesson_ref?: string;
  lesson_version_id?: string;
  version_number?: number;
  status?: string;
};

const emptyCounts: CompleteLessonCounts = {
  storyPassages: 0,
  storyWords: 0,
  kanji: 0,
  vocabulary: 0,
  grammar: 0,
  vocabularyQuestions: 0,
  grammarQuestions: 0,
  speakingSentences: 0,
  readingPassages: 0,
  readingQuestions: 0,
  listeningQuestions: 0,
  reviewQuestions: 0,
};

export function CompleteLessonImporter() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState("");
  const [publish, setPublish] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => {
    if (!source.trim()) return { value: null as unknown, error: "" };
    try {
      return { value: parseCompleteLessonImport(source), error: "" };
    } catch (error) {
      return {
        value: null as unknown,
        error: error instanceof Error ? error.message : "The pasted lesson is not valid JSON or JSONL.",
      };
    }
  }, [source]);
  const validation = useMemo(
    () => parsed.value ? validateCompleteLessonImport(parsed.value) : { valid: false, errors: [], counts: emptyCounts },
    [parsed.value],
  );

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setMessage("Use a JSON, JSONL, or TXT lesson file smaller than 4 MB.");
      return;
    }
    setSource(await file.text());
    setResult(null);
    setMessage(`Loaded ${file.name}.`);
    event.target.value = "";
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(COMPLETE_LESSON_CHAT_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function submit() {
    if (!parsed.value || !validation.valid || submitting) return;
    setSubmitting(true);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/lessons/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson: parsed.value, publish }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const body = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      if (!response.ok) {
        const details = Array.isArray(body.errors)
          ? body.errors.filter((item): item is string => typeof item === "string").slice(0, 4).join(" ")
          : "";
        throw new Error(`${typeof body.error === "string" ? body.error : "The lesson could not be imported."} ${details}`.trim());
      }
      const stored = body.result && typeof body.result === "object" && !Array.isArray(body.result)
        ? body.result as ImportResult
        : {};
      setResult(stored);
      setMessage(publish
        ? "Complete lesson published. It is available to the assignment engine."
        : "Complete lesson stored as a draft. Review or preview it before publishing.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The lesson could not be imported.");
    } finally {
      setSubmitting(false);
    }
  }

  const counts = validation.counts;
  const hasSource = source.trim().length > 0;
  return (
    <>
      <AdminPageHeader
        eyebrow="Complete lesson import"
        title="Bring an entire AIko lesson in one file."
        description="Generate the package in your preferred AI chat, validate it here, and store it directly. The importer makes no generation-model request; learner speaking keeps using the existing STT endpoint."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,.8fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">Lesson JSON</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">Upload or paste the complete package</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Accepted formats: JSON, object-based JSONL, or plain text containing either format.</p>
            </div>
            <Button type="button" variant="secondary" className="rounded-xl" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Choose file
            </Button>
            <input ref={fileRef} type="file" accept=".json,.jsonl,.txt,application/json,text/plain" className="hidden" onChange={(event) => void chooseFile(event)} />
          </div>

          <label className="mt-5 block text-sm font-bold text-slate-700" htmlFor="complete-lesson-json">Complete lesson response</label>
          <textarea
            id="complete-lesson-json"
            value={source}
            onChange={(event) => { setSource(event.target.value); setResult(null); setMessage(""); }}
            rows={20}
            spellCheck={false}
            placeholder="Paste the AI's JSON response here…"
            className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
          />

          {hasSource && (
            <div className={`mt-5 rounded-2xl border p-4 ${validation.valid ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center gap-3">
                <ShieldCheck className={`size-5 ${validation.valid ? "text-emerald-700" : "text-amber-700"}`} />
                <div>
                  <p className="font-bold text-slate-900">{validation.valid ? "Ready to import" : parsed.error || `${validation.errors.length} contract issue(s)`}</p>
                  <p className="mt-1 text-xs text-slate-600">Only deterministic parsing and validation run here. No lesson content is sent to an AI API.</p>
                </div>
              </div>
              {!parsed.error && validation.errors.length > 0 && (
                <ul className="mt-4 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-amber-900">
                  {validation.errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Count label="Story" value={`${counts.storyPassages} / ${counts.storyWords} words`} />
            <Count label="Targets" value={`${counts.kanji} kanji · ${counts.grammar} grammar`} />
            <Count label="Practice" value={`${counts.vocabularyQuestions} vocab · ${counts.grammarQuestions} grammar`} />
            <Count label="Communication" value={`${counts.speakingSentences} read aloud · ${counts.readingQuestions} read · ${counts.listeningQuestions} listen`} />
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} className="mt-0.5 size-4 accent-teal-700" />
            <span><strong className="block text-sm text-slate-900">Publish immediately</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Leave this off to save a reviewable draft. Publishing places the canonical version into the learner assignment library.</span></span>
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" className="rounded-xl" disabled={!validation.valid || submitting} onClick={() => void submit()}>
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <FileJson2 className="size-4" />}
              {submitting ? "Storing lesson…" : publish ? "Import and publish" : "Import as draft"}
            </Button>
            {result?.lesson_ref && <Link href={`/admin/lessons/${result.lesson_ref}/edit`} className="text-sm font-bold text-teal-700 hover:text-teal-900">Open lesson editor →</Link>}
            {result?.lesson_ref && publish && <Link href={`/lesson/${result.lesson_ref}/preview`} className="text-sm font-bold text-teal-700 hover:text-teal-900">Preview lesson →</Link>}
          </div>
          {message && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${result ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{message}</p>}
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">Chat prompt</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">Generate the upload file</h2>
            </div>
            <Button type="button" variant="secondary" className="rounded-xl" onClick={() => void copyPrompt()}>
              {copied ? <CheckCircle2 className="size-4" /> : <Clipboard className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>Copy the prompt and replace the five control placeholders.</li>
            <li>Send it in the AI chat of your choice.</li>
            <li>Paste or upload the JSON response in the importer.</li>
          </ol>
          <textarea readOnly value={COMPLETE_LESSON_CHAT_PROMPT} rows={24} className="mt-5 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-5 text-slate-700 outline-none" aria-label="Complete lesson AI chat prompt" />
        </aside>
      </div>
    </>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value}</p></div>;
}
