"use client";

import { useEffect, useState } from "react";
import { CloudUpload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import { findLegacyImport, importLegacyData, shouldOfferLegacyImport } from "@/lib/migrations/local-to-supabase";
import type { LegacyImportPreview, LegacyImportReport } from "@/lib/migrations/migration-types";

export function LegacyImportAssistant() {
  const [preview, setPreview] = useState<LegacyImportPreview | null>(null);
  const [report, setReport] = useState<LegacyImportReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (getBackendMode() !== "supabase") return;
    void shouldOfferLegacyImport().then((offer) => {
      if (offer) setPreview(findLegacyImport());
    });
  }, []);

  if (!preview || dismissed) return null;

  async function runImport() {
    if (!preview) return;
    setLoading(true);
    setError("");
    const result = await importLegacyData(preview);
    setLoading(false);
    if (!result.ok) return setError(result.error.message);
    setReport(result.data);
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-[110] mx-auto max-w-lg rounded-2xl border border-moss-200 bg-surface p-5 shadow-2xl">
      <button type="button" onClick={() => setDismissed(true)} className="absolute right-2 top-2 grid size-11 place-items-center rounded-full text-muted hover:bg-surface-muted" aria-label="Dismiss import"><X className="size-4" aria-hidden="true" /></button>
      <CloudUpload className="size-6 text-moss-700" />
      <h2 className="mt-3 pr-8 text-lg font-bold text-ink">{report ? "Device progress import complete" : "AIko found progress saved on this device. Import it to your account?"}</h2>
      {report ? (
        <p className="mt-2 text-sm leading-6 text-muted">Imported {report.lessons} lessons, {report.mastery} mastery items, {report.queue} review items, and {report.achievements} achievements. {report.skipped > 0 ? `${report.skipped} unsupported or malformed records were skipped.` : ""}</p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted">Preview: {preview.summary.completedLessons} lessons, {preview.summary.masteryItems} mastery items, {preview.summary.reviewItems} review items, and {preview.summary.achievements} achievements. Existing server records are kept.</p>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
      <div className="mt-4 flex gap-3">
        {report ? <Button onClick={() => setDismissed(true)} className="flex-1">Done</Button> : <>
          <Button onClick={runImport} disabled={loading} className="flex-1">{loading ? "Importing…" : "Import progress"}</Button>
          <Button variant="secondary" onClick={() => setDismissed(true)}>Not now</Button>
        </>}
      </div>
    </div>
  );
}
