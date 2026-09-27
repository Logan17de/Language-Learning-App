"use client";

import { useState, type FormEvent } from "react";
import { Check, Flag, X } from "lucide-react";
import { usePathname } from "next/navigation";
import type { LessonReport } from "@/types/app-preferences";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { reportRepository } from "@/lib/repositories/report-repository";
import { getBackendMode } from "@/lib/supabase/config";

const categories: LessonReport["category"][] = [
  "incorrect translation",
  "incorrect reading",
  "grammar explanation issue",
  "wrong answer key",
  "audio issue",
  "image issue",
  "inappropriate content",
  "lesson too difficult",
  "technical issue",
  "other",
];

export function LessonReportDialog({
  lessonId,
  lessonTitle,
  phase,
  activityId,
  userAnswer,
  compact = false,
}: {
  lessonId: string;
  lessonTitle: string;
  phase?: string;
  activityId?: string;
  userAnswer?: string;
  compact?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const addReport = useAppStore((state) => state.addLessonReport);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<LessonReport["category"]>("incorrect translation");
  const [details, setDetails] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (getBackendMode() === "supabase") {
      setLoading(true);
      const result = await reportRepository.submitForLessonRef({
        lessonRef: lessonId,
        phase,
        activityId,
        category,
        description: details,
        userAnswer,
        route: pathname,
      });
      setLoading(false);
      if (!result.ok) return setError(result.error.message);
    }
    addReport({
      id: `report_${lessonId}_${phase ?? "general"}_${category.replaceAll(" ", "_")}`,
      category,
      details,
      lessonId,
      lessonTitle,
      phase,
      activityId,
      userAnswer,
      route: pathname,
      createdAt: "Just now",
    });
    setSuccess(true);
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setSuccess(false); }} className={compact ? "inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-semibold text-muted hover:bg-surface-muted" : "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-muted hover:bg-surface-muted"}><Flag className="size-4" aria-hidden="true" /> Report issue</button>
      <Dialog
        open={open}
        onClose={() => {
          if (!loading) setOpen(false);
        }}
        labelledBy="report-title"
        describedBy="report-context"
        closeOnBackdrop={!loading}
      >
            <div className="flex items-start justify-between gap-4"><div><p className="section-kicker">Lesson feedback</p><h2 id="report-title" className="mt-2 text-2xl font-semibold">Report an issue</h2></div><button type="button" onClick={() => setOpen(false)} disabled={loading} aria-label="Close report dialog" data-dialog-autofocus className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted"><X className="size-5" aria-hidden="true" /></button></div>
            {success ? (
              <div className="py-8 text-center" role="status"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-positive-surface text-positive"><Check className="size-7" aria-hidden="true" /></span><h3 className="mt-5 text-xl font-semibold">Thanks. Your report has been saved for review.</h3><p className="mt-2 text-sm text-muted">{getBackendMode() === "supabase" ? "The report and lesson version are now available to staff." : "Demo mode retained the lesson context on this device."}</p><Button type="button" className="mt-6" onClick={() => setOpen(false)}>Done</Button></div>
            ) : (
              <form className="mt-6 space-y-5" onSubmit={submit}>
                <div id="report-context" className="rounded-2xl bg-surface-muted p-4 text-xs leading-5 text-muted"><strong className="text-ink">{lessonTitle}</strong><br />{lessonId}{phase ? ` · ${phase}` : ""}{activityId ? ` · ${activityId}` : ""}<br /><span>{pathname}</span></div>
                <label className="block"><span className="mb-2 block text-sm font-semibold">Issue category</span><select value={category} onChange={(event) => setCategory(event.target.value as LessonReport["category"])} className="form-input capitalize">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="block"><span className="mb-2 block text-sm font-semibold">What seems wrong?</span><textarea required minLength={8} value={details} onChange={(event) => setDetails(event.target.value)} className="form-input min-h-32 resize-none py-3" placeholder="Describe what you expected and what you saw." /></label>
                {error && <Alert tone="error">{error}</Alert>}
                <Button type="submit" disabled={loading} aria-busy={loading} className="w-full"><Flag className="size-4" aria-hidden="true" /> {loading ? "Submitting…" : "Save report"}</Button>
              </form>
            )}
      </Dialog>
    </>
  );
}
