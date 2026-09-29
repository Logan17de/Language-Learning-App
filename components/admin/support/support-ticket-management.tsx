"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Search } from "lucide-react";
import type { Priority, SupportTicketStatus } from "@/types/admin";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
  AdminTable,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { adminOperationsRepository } from "@/lib/repositories/admin-operations-repository";
import type { Database } from "@/types/database";

type SupportRow = Database["public"]["Tables"]["support_tickets"]["Row"];

function displayStatus(status: string): SupportTicketStatus {
  return status.replaceAll("_", " ") as SupportTicketStatus;
}

export function SupportTicketManagement() {
  const [rows, setRows] = useState<SupportRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SupportTicketStatus | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await adminOperationsRepository.listSupportTickets();
    if (result.ok) setRows(result.data);
    else setError(result.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(
    requestId: string,
    nextStatus: SupportTicketStatus,
    nextPriority?: Priority,
  ) {
    setError("");
    const response = await fetch(`/api/admin/support/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: nextStatus.replaceAll(" ", "_"),
        priority: nextPriority,
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | SupportRow
      | { error?: string }
      | null;
    if (!response.ok || !body || !("id" in body)) {
      setError(
        body && "error" in body && body.error
          ? body.error
          : "The support ticket could not be updated.",
      );
      return;
    }
    setRows((items) =>
      items.map((item) => (item.id === body.id ? body : item)),
    );
  }

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const rowStatus = displayStatus(row.status);
        return (
          (!query ||
            `${row.subject} ${row.category} ${row.user_id}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (status === "all" || rowStatus === status) &&
          (priority === "all" || row.priority === priority)
        );
      }),
    [priority, query, rows, status],
  );

  return (
    <>
      <AdminPageHeader
        eyebrow="Learner operations"
        title="Support requests"
        description="Live support tickets from Supabase with persisted category, priority, assignment, status, and timestamps."
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
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_13rem_11rem]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Search support"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="admin-input pl-9"
            placeholder="Subject, category, or learner ID"
          />
        </label>
        <select
          aria-label="Ticket status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as SupportTicketStatus | "all")
          }
          className="admin-input"
        >
          <option value="all">All statuses</option>
          {["new", "open", "waiting for user", "resolved", "closed"].map(
            (item) => (
              <option key={item}>{item}</option>
            ),
          )}
        </select>
        <select
          aria-label="Ticket priority"
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

      {loading && !rows.length ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      ) : visible.length ? (
        <AdminTable
          caption="Support request tickets"
          headers={[
            "Learner",
            "Category",
            "Subject",
            "Submitted",
            "Priority",
            "Status",
            "Last update",
            "Assignment",
          ]}
          rows={visible.map((row) => {
            const rowStatus = displayStatus(row.status);
            return {
              id: row.id,
              cells: [
                <Link
                  key="user"
                  href={`/admin/users/${row.user_id}`}
                  className="font-semibold text-teal-700"
                >
                  {row.user_id.slice(0, 8)}…
                </Link>,
                row.category,
                <Link
                  key="subject"
                  href={`/admin/support/${row.id}`}
                  className="font-bold text-teal-700"
                >
                  {row.subject}
                </Link>,
                new Date(row.created_at).toLocaleString(),
                <select
                  key="priority"
                  value={row.priority}
                  onChange={(event) =>
                    void update(
                      row.id,
                      rowStatus,
                      event.target.value as Priority,
                    )
                  }
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                >
                  {["low", "medium", "high", "urgent"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>,
                <AdminStatus key="status">{rowStatus}</AdminStatus>,
                new Date(row.updated_at).toLocaleString(),
                row.assigned_to ?? "Unassigned",
              ],
            };
          })}
        />
      ) : (
        <AdminEmptyState
          title="No support requests"
          description="No persisted support tickets match the current filters."
        />
      )}
    </>
  );
}
