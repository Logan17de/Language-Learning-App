"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, Save } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { LessonReportStatus, Priority } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminSection, AdminStatus } from "@/components/admin/admin-primitives";
import { Button, ButtonLink } from "@/components/ui/button";

export function LessonReportDetail({ reportId }: { reportId: string }) {
  const report = useAppStore((state) => state.lessonReports.find((item) => item.id === reportId));
  const state = useAdminStore((store) => store.reportStates[reportId]);
  const update = useAdminStore((store) => store.updateReport);
  const notify = useAdminStore((store) => store.notifyReportUser);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  if (!report) return <AdminEmptyState title="Report not found" description="This report ID is invalid or no longer exists in learner state." />;
  const currentStatus = state?.status ?? "new";
  const currentPriority = state?.priority ?? "medium";
  function addNote(event: FormEvent) { event.preventDefault(); if (!note.trim()) return; update(reportId, currentStatus, currentPriority, note.trim()); setNote(""); setMessage("Internal note saved."); }
  return (
    <>
      <AdminPageHeader eyebrow="Lesson report detail" title={report.category} description={`${report.id} · ${report.createdAt}`} actions={<AdminStatus>{currentStatus}</AdminStatus>} />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      <div className="mb-6 flex flex-wrap gap-2"><select aria-label="Report status" value={currentStatus} onChange={(event) => { update(reportId, event.target.value as LessonReportStatus, currentPriority); setMessage("Report status updated."); }} className="admin-input w-48">{["new", "investigating", "confirmed", "fixed", "rejected", "closed"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Report priority" value={currentPriority} onChange={(event) => update(reportId, currentStatus, event.target.value as Priority)} className="admin-input w-40">{["low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select><ButtonLink href={`/admin/lessons/${report.lessonId}/edit`} variant="secondary" className="rounded-xl">Open lesson editor</ButtonLink><Button type="button" className="rounded-xl" onClick={() => { update(reportId, "fixed", currentPriority, "Issue marked fixed from report detail."); setMessage("Report marked fixed."); }}><CheckCircle2 className="size-4" /> Mark fixed</Button><Button type="button" variant="secondary" className="rounded-xl" onClick={() => { if (!state) update(reportId, currentStatus, currentPriority); notify(reportId); setMessage("Mock user notification recorded."); }}><Bell className="size-4" /> Notify user</Button></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6"><AdminSection title="Report context"><dl className="grid gap-4 sm:grid-cols-2">{[["Lesson", report.lessonTitle], ["Lesson ID", report.lessonId], ["Phase", report.phase ?? "General"], ["Activity", report.activityId ?? "None"], ["Route", report.route], ["User answer", report.userAnswer ?? "Not captured"]].map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 break-all text-sm font-semibold">{value}</dd></div>)}</dl><div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Learner description</p><p className="mt-2 leading-6 text-slate-700">{report.details}</p></div></AdminSection><AdminSection title="Internal notes">{state?.internalNotes.length ? state.internalNotes.map((item, index) => <p key={`${item}_${index}`} className="border-b border-slate-100 py-3 text-sm last:border-0">{item}</p>) : <p className="py-6 text-center text-sm text-slate-500">No internal notes.</p>}</AdminSection></div>
        <AdminSection title="Add internal note"><form onSubmit={addNote}><textarea required value={note} onChange={(event) => setNote(event.target.value)} className="admin-input min-h-36 py-3" placeholder="Investigation notes are never shown to the learner." /><Button type="submit" className="mt-3 w-full rounded-xl"><Save className="size-4" /> Save note</Button></form><p className="mt-4 text-xs text-slate-500">Assigned to: {state?.assignedTo ?? "Unassigned"}</p>{state?.userNotified && <p className="mt-2 text-xs font-bold text-emerald-700">Mock user notification sent</p>}<Link href={`/admin/lessons/${report.lessonId}`} className="mt-4 block text-sm font-bold text-teal-700">View lesson detail →</Link></AdminSection>
      </div>
    </>
  );
}
