"use client";

import { useState, type FormEvent } from "react";
import { Check, Flag, X } from "lucide-react";
import { usePathname } from "next/navigation";
import type { LessonReport } from "@/types/app-preferences";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
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
      <button type="button" onClick={() => { setOpen(true); setSuccess(false); }} className={compact ? "inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-stone-400 hover:bg-stone-100" : "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-stone-500 hover:bg-stone-100"}><Flag className="size-4" /> Report issue</button>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/55 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <div className="w-full max-w-lg rounded-4xl bg-white p-7 shadow-float">
            <div className="flex items-start justify-between"><div><p className="section-kicker">Lesson feedback</p><h2 id="report-title" className="mt-2 text-2xl font-semibold">Report an issue</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close report dialog" className="grid size-10 place-items-center rounded-full hover:bg-stone-100"><X className="size-5" /></button></div>
            {success ? (
              <div className="py-8 text-center" role="status"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-moss-100 text-moss-700"><Check className="size-7" /></span><h3 className="mt-5 text-xl font-semibold">Thanks. Your report has been saved for review.</h3><p className="mt-2 text-sm text-stone-500">{getBackendMode() === "supabase" ? "The report and lesson version are now available to staff." : "Demo mode retained the lesson context on this device."}</p><Button type="button" className="mt-6" onClick={() => setOpen(false)}>Done</Button></div>
            ) : (
              <form className="mt-6 space-y-5" onSubmit={submit}>
                <div className="rounded-2xl bg-moss-50 p-4 text-xs leading-5 text-moss-900"><strong>{lessonTitle}</strong><br />{lessonId}{phase ? ` · ${phase}` : ""}{activityId ? ` · ${activityId}` : ""}<br /><span className="opacity-60">{pathname}</span></div>
                <label className="block"><span className="mb-2 block text-sm font-semibold">Issue category</span><select value={category} onChange={(event) => setCategory(event.target.value as LessonReport["category"])} className="form-input capitalize">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="block"><span className="mb-2 block text-sm font-semibold">What seems wrong?</span><textarea required minLength={8} value={details} onChange={(event) => setDetails(event.target.value)} className="form-input min-h-32 resize-none py-3" placeholder="Describe what you expected and what you saw." /></label>
                {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full"><Flag className="size-4" /> {loading ? "Submitting…" : "Save report"}</Button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
