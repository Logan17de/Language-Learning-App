"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, RefreshCw, Save } from "lucide-react";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  adminSupportRepository,
  type AdminReportDetailData,
} from "@/lib/repositories/admin-support-repository";
import type { Json } from "@/types/database";

export function LessonReportDetail({ reportId }: { reportId: string }) {
  const [data, setData] = useState<AdminReportDetailData | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await adminSupportRepository.getReport(reportId);
    if (result.ok) setData(result.data);
    else setError(result.error.message);
    setLoading(false);
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateReport(values: {
    status?: string;
    priority?: string;
    note?: string;
  }) {
    setWorking(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Report could not be updated.");
      setWorking(false);
      return;
    }
    if (values.note) setNote("");
    setMessage(
      values.note && !values.status && !values.priority
        ? "Internal note saved to the audit trail."
        : "Report updated.",
    );
    await load();
    setWorking(false);
  }

  if (loading && !data) {
    return (
      <div
        className="h-80 animate-pulse rounded-2xl bg-slate-100"
        aria-label="Loading lesson report"
      />
    );
  }
  if (!data) {
    return (
      <AdminEmptyState
        title="Report could not be loaded"
        description={
          error ||
          "This report does not exist or is not visible to the current administrator."
        }
      />
    );
  }

  const report = data.report;
  const notes = data.audit
    .map((item) => ({ ...item, note: auditNote(item.metadata) }))
    .filter((item) => item.note);

  return (
    <>
      <AdminPageHeader
        eyebrow="Live lesson report detail"
        title={report.category}
        description={`${report.id} · ${new Date(report.submitted_at).toLocaleString()} · learner ${data.learner?.display_name || report.user_id}`}
        actions={
          <div className="flex items-center gap-2">
            <AdminStatus>{report.status}</AdminStatus>
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl"
              disabled={loading || working}
              onClick={() => void load()}
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        }
      />
      {message && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <select
          aria-label="Report status"
          value={report.status}
          disabled={working}
          onChange={(event) =>
            void updateReport({ status: event.target.value })
          }
          className="admin-input w-48"
        >
          {["new", "investigating", "confirmed", "fixed", "rejected", "closed"].map(
            (item) => (
              <option key={item}>{item}</option>
            ),
          )}
        </select>
        <select
          aria-label="Report priority"
          value={report.priority}
          disabled={working}
          onChange={(event) =>
            void updateReport({ priority: event.target.value })
          }
          className="admin-input w-40"
        >
          {["low", "medium", "high", "urgent"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <ButtonLink
          href={`/admin/lessons/${report.lesson_id}/edit`}
          variant="secondary"
          className="rounded-xl"
        >
          Open lesson editor
        </ButtonLink>
        <Button
          type="button"
          className="rounded-xl"
          disabled={working || report.status === "fixed"}
          onClick={() => void updateReport({ status: "fixed" })}
        >
          <CheckCircle2 className="size-4" /> Mark fixed
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <AdminSection title="Report context">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact
                label="Lesson"
                value={data.lesson?.title || report.lesson_id}
              />
              <Fact label="Lesson ID" value={report.lesson_id} />
              <Fact
                label="Lesson status"
                value={data.lesson?.status || "Unknown"}
              />
              <Fact
                label="Learner"
                value={data.learner?.display_name || report.user_id}
              />
              <Fact
                label="Learner level"
                value={data.learner?.current_jlpt_level || "Unknown"}
              />
              <Fact label="Phase" value={report.phase || "General"} />
              <Fact label="Activity" value={report.activity_id || "None"} />
              <Fact label="Route" value={report.route || "Unknown"} />
              <Fact
                label="User answer"
                value={report.user_answer || "Not captured"}
              />
              <Fact
                label="Assigned to"
                value={report.assigned_to || "Unassigned"}
              />
            </dl>
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Learner description
              </p>
              <p className="mt-2 whitespace-pre-wrap leading-6 text-slate-700">
                {report.description}
              </p>
            </div>
          </AdminSection>

          <AdminSection
            title="Internal notes"
            description="Stored in the immutable admin audit trail."
          >
            {notes.length ? (
              notes.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-slate-100 py-3 last:border-0"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong className="text-sm">
                      {item.action.replaceAll("_", " ")}
                    </strong>
                    <span className="text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {item.note}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">
                No internal notes.
              </p>
            )}
          </AdminSection>

          <AdminSection title="Audit history">
            {data.audit.length ? (
              data.audit.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0"
                >
                  <div>
                    <strong className="text-sm capitalize">
                      {item.action.replaceAll("_", " ")}
                    </strong>
                    <p className="text-xs text-slate-500">
                      Actor {item.actor_user_id}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">
                No admin actions recorded yet.
              </p>
            )}
          </AdminSection>
        </div>

        <div className="space-y-6">
          <AdminSection title="Add internal note">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (note.trim()) void updateReport({ note: note.trim() });
              }}
            >
              <textarea
                required
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="admin-input min-h-36 py-3"
                placeholder="Investigation notes are stored in the admin audit trail and are not shown to the learner."
              />
              <Button
                type="submit"
                disabled={working || !note.trim()}
                className="mt-3 w-full rounded-xl"
              >
                <Save className="size-4" /> Save note
              </Button>
            </form>
          </AdminSection>
          <AdminSection title="Learner notification">
            <p className="text-sm leading-6 text-slate-600">
              No outbound email or push-notification service is connected for
              report updates, so this screen does not expose a fake notification
              action.
            </p>
          </AdminSection>
          <AdminSection title="Related records">
            <Link
              href={`/admin/lessons/${report.lesson_id}`}
              className="block text-sm font-bold text-teal-700"
            >
              View lesson detail →
            </Link>
            <Link
              href={`/admin/users/${report.user_id}`}
              className="mt-3 block text-sm font-bold text-teal-700"
            >
              View learner →
            </Link>
          </AdminSection>
        </div>
      </div>
    </>
  );
}

function auditNote(metadata: Json): string {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return "";
  }
  const value = metadata.note;
  return typeof value === "string" ? value : "";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-all text-sm font-semibold">{value}</dd>
    </div>
  );
}
