"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { LessonReport } from "@/types/app-preferences";
import type { LessonReportStatus, Priority } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminTable } from "@/components/admin/admin-primitives";

export function LessonReportManagement() {
  const reports = useAppStore((state) => state.lessonReports);
  const states = useAdminStore((state) => state.reportStates);
  const update = useAdminStore((state) => state.updateReport);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LessonReport["category"] | "all">("all");
  const [status, setStatus] = useState<LessonReportStatus | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const categories = [...new Set(reports.map((report) => report.category))];
  const visible = useMemo(() => reports.filter((report) => {
    const state = states[report.id];
    return (!query || `${report.lessonTitle} ${report.details} ${report.route}`.toLowerCase().includes(query.toLowerCase())) && (category === "all" || report.category === category) && (status === "all" || (state?.status ?? "new") === status) && (priority === "all" || (state?.priority ?? "medium") === priority);
  }), [category, priority, query, reports, states, status]);
  return (
    <>
      <AdminPageHeader eyebrow="Learner quality feedback" title="Lesson reports" description="Reports synchronize directly from Phase 3 learner submissions, including route, phase, activity, and answer context." />
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_13rem_12rem_11rem]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Lesson, description, or route" /></label><select aria-label="Report category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="admin-input capitalize"><option value="all">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Report status" value={status} onChange={(event) => setStatus(event.target.value as LessonReportStatus | "all")} className="admin-input"><option value="all">All statuses</option>{["new", "investigating", "confirmed", "fixed", "rejected", "closed"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Report priority" value={priority} onChange={(event) => setPriority(event.target.value as Priority | "all")} className="admin-input"><option value="all">All priorities</option>{["low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select></div>
      {visible.length ? <AdminTable caption="Learner lesson reports" headers={["Category", "Lesson", "Phase / activity", "User", "Description", "Route", "Submitted", "Priority", "Status", "Assignment"]} rows={visible.map((report) => {
        const state = states[report.id];
        return { id: report.id, cells: [<Link key="category" href={`/admin/reports/${report.id}`} className="font-bold capitalize text-teal-700">{report.category}</Link>, <Link key="lesson" href={`/admin/lessons/${report.lessonId}`} className="font-semibold hover:text-teal-700">{report.lessonTitle}</Link>, `${report.phase ?? "General"}${report.activityId ? ` · ${report.activityId}` : ""}`, "Learner", <span key="details" className="block max-w-60 truncate">{report.details}</span>, report.route, report.createdAt, <select key="priority" value={state?.priority ?? "medium"} onChange={(event) => update(report.id, state?.status ?? "new", event.target.value as Priority)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs capitalize">{["low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select>, <select key="status" value={state?.status ?? "new"} onChange={(event) => update(report.id, event.target.value as LessonReportStatus, state?.priority)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs capitalize">{["new", "investigating", "confirmed", "fixed", "rejected", "closed"].map((item) => <option key={item}>{item}</option>)}</select>, state?.assignedTo ?? "Unassigned"] };
      })} /> : <AdminEmptyState title="No lesson reports" description="Submit a report from any learner lesson preview, phase, or result to see it synchronize here." />}
    </>
  );
}
