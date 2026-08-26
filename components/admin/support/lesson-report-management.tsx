"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Search } from "lucide-react";
import type { LessonReport } from "@/types/app-preferences";
import type { LessonReportStatus, Priority } from "@/types/admin";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminTable,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { adminOperationsRepository } from "@/lib/repositories/admin-operations-repository";
import type { Database } from "@/types/database";

type ReportRow = Database["public"]["Tables"]["lesson_reports"]["Row"];

export function LessonReportManagement() {
  const [backendRows, setBackendRows] = useState<ReportRow[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LessonReport["category"] | "all">(
    "all",
  );
  const [status, setStatus] = useState<LessonReportStatus | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await adminOperationsRepository.listReports();
    if (result.ok) setBackendRows(result.data);
    else setError(result.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    // State updates land in a promise callback rather than synchronously in
    // the effect body, so the initial load cannot cascade renders.
    void Promise.resolve().then(() => {
      if (active) return load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const reports: LessonReport[] = backendRows.map((row) => ({
    id: row.id,
    category: row.category as LessonReport["category"],
    details: row.description,
    lessonId: row.lesson_id,
    lessonTitle: row.lesson_id,
    phase: row.phase ?? undefined,
    activityId: row.activity_id ?? undefined,
    userAnswer: row.user_answer ?? undefined,
    route: row.route,
    createdAt: new Date(row.submitted_at).toLocaleString(),
  }));
  const states = Object.fromEntries(
    backendRows.map((row) => [
      row.id,
      {
        reportId: row.id,
        status: row.status as LessonReportStatus,
        priority: row.priority as Priority,
        assignedTo: row.assigned_to ?? "Unassigned",
      },
    ]),
  );

  async function update(
    reportId: string,
    nextStatus: LessonReportStatus,
    nextPriority?: Priority,
  ) {
    setError("");
    const response = await fetch(`/api/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, priority: nextPriority }),
    });
    const body = (await response.json().catch(() => null)) as
      | ReportRow
      | { error?: string }
      | null;
    if (!response.ok || !body || !("id" in body)) {
      setError(
        body && "error" in body && body.error
          ? body.error
          : "The report could not be updated.",
      );
      return;
    }
    setBackendRows((items) =>
      items.map((item) => (item.id === body.id ? body : item)),
    );
  }

  const categories = [...new Set(reports.map((report) => report.category))];
  const visible = useMemo(
    () =>
      reports.filter((report) => {
        const state = states[report.id];
        return (
          (!query ||
            `${report.lessonTitle} ${report.details} ${report.route}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (category === "all" || report.category === category) &&
          (status === "all" || state?.status === status) &&
          (priority === "all" || state?.priority === priority)
        );
      }),
    [category, priority, query, reports, states, status],
  );

  return (
    <>
      <AdminPageHeader
        eyebrow="Learner quality feedback"
        title="Lesson reports"
        description="Live learner reports from Supabase, including route, phase, activity, and answer context."
        actions={
          <Button
            type="button"
            variant="secondary"
            className="rounded-xl"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_13rem_12rem_11rem]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Search reports"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="admin-input pl-9"
            placeholder="Lesson, description, or route"
          />
        </label>
        <select
          aria-label="Report category"
          value={category}
          onChange={(event) => setCategory(event.target.value as typeof category)}
          className="admin-input capitalize"
        >
          <option value="all">All categories</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Report status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as LessonReportStatus | "all")
          }
          className="admin-input"
        >
          <option value="all">All statuses</option>
          {["new", "investigating", "confirmed", "fixed", "rejected", "closed"].map(
            (item) => (
              <option key={item}>{item}</option>
            ),
          )}
        </select>
        <select
          aria-label="Report priority"
          value={priority}
          onChange={(event) =>
            setPriority(event.target.value as Priority | "all")
          }
          className="admin-input"
        >
          <option value="all">All priorities</option>
          {["low", "medium", "high", "urgent"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      {loading && !backendRows.length ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      ) : visible.length ? (
        <AdminTable
          caption="Learner lesson reports"
          headers={[
            "Category",
            "Lesson",
            "Phase / activity",
            "Description",
            "Route",
            "Submitted",
            "Priority",
            "Status",
            "Assignment",
          ]}
          rows={visible.map((report) => {
            const state = states[report.id];
            return {
              id: report.id,
              cells: [
                <Link
                  key="category"
                  href={`/admin/reports/${report.id}`}
                  className="font-bold capitalize text-teal-700"
                >
                  {report.category}
                </Link>,
                <Link
                  key="lesson"
                  href={`/admin/lessons/${report.lessonId}`}
                  className="font-semibold hover:text-teal-700"
                >
                  {report.lessonTitle}
                </Link>,
                `${report.phase ?? "General"}${
                  report.activityId ? ` · ${report.activityId}` : ""
                }`,
                <span key="details" className="block max-w-60 truncate">
                  {report.details}
                </span>,
                report.route,
                report.createdAt,
                <select
                  key="priority"
                  value={state?.priority ?? "medium"}
                  onChange={(event) =>
                    void update(
                      report.id,
                      state?.status ?? "new",
                      event.target.value as Priority,
                    )
                  }
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs capitalize"
                >
                  {["low", "medium", "high", "urgent"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>,
                <select
                  key="status"
                  value={state?.status ?? "new"}
                  onChange={(event) =>
                    void update(
                      report.id,
                      event.target.value as LessonReportStatus,
                      state?.priority,
                    )
                  }
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs capitalize"
                >
                  {["new", "investigating", "confirmed", "fixed", "rejected", "closed"].map(
                    (item) => (
                      <option key={item}>{item}</option>
                    ),
                  )}
                </select>,
                state?.assignedTo ?? "Unassigned",
              ],
            };
          })}
        />
      ) : (
        <AdminEmptyState
          title="No lesson reports"
          description="No persisted learner reports match the current filters."
        />
      )}
    </>
  );
}
