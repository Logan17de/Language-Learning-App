"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { Priority, SupportTicketStatus } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";
import { getBackendMode } from "@/lib/supabase/config";
import { adminOperationsRepository } from "@/lib/repositories/admin-operations-repository";
import type { Database } from "@/types/database";
import type { SupportRequest } from "@/types/app-preferences";

export function SupportTicketManagement() {
  const localRequests = useAppStore((state) => state.supportRequests);
  const localTickets = useAdminStore((state) => state.supportTickets);
  const updateLocal = useAdminStore((state) => state.updateSupportTicket);
  const backendMode = getBackendMode() === "supabase";
  const [backendRows, setBackendRows] = useState<Database["public"]["Tables"]["support_tickets"]["Row"][]>([]);
  const requests: SupportRequest[] = backendMode ? backendRows.map((row) => ({
    id: row.id,
    type: row.category as SupportRequest["type"],
    email: "Protected learner",
    subject: row.subject,
    message: "",
    createdAt: new Date(row.created_at).toLocaleString(),
  })) : localRequests;
  const tickets = backendMode ? Object.fromEntries(backendRows.map((row) => [row.id, {
    requestId: row.id,
    status: row.status.replaceAll("_", " ") as SupportTicketStatus,
    priority: row.priority as Priority,
    assignedTo: row.assigned_to ?? "Unassigned",
    internalNotes: [],
    conversation: [],
    updatedAt: row.updated_at,
  }])) : localTickets;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SupportTicketStatus | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  useEffect(() => {
    if (!backendMode) return;
    void adminOperationsRepository.listSupportTickets().then((result) => {
      if (result.ok) setBackendRows(result.data);
    });
  }, [backendMode]);
  function update(requestId: string, nextStatus: SupportTicketStatus, nextPriority?: Priority) {
    if (!backendMode) {
      updateLocal(requestId, nextStatus, nextPriority);
      return;
    }
    void fetch(`/api/admin/support/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus.replaceAll(" ", "_"), priority: nextPriority }),
    }).then(async (response) => {
      if (!response.ok) return;
      const row = await response.json() as Database["public"]["Tables"]["support_tickets"]["Row"];
      setBackendRows((items) => items.map((item) => item.id === row.id ? row : item));
    });
  }
  const visible = useMemo(() => requests.filter((request) => {
    const ticket = tickets[request.id];
    return (!query || `${request.email} ${request.subject} ${request.message}`.toLowerCase().includes(query.toLowerCase())) && (status === "all" || (ticket?.status ?? "new") === status) && (priority === "all" || (ticket?.priority ?? "medium") === priority);
  }), [priority, query, requests, status, tickets]);
  return (
    <>
      <AdminPageHeader eyebrow="Learner operations" title="Support requests" description="Support requests synchronize directly from Phase 3 and gain a local conversation, internal notes, priority, assignment, and status." />
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_13rem_11rem]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search support" value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="User, subject, or request" /></label><select aria-label="Ticket status" value={status} onChange={(event) => setStatus(event.target.value as SupportTicketStatus | "all")} className="admin-input"><option value="all">All statuses</option>{["new", "open", "waiting for user", "resolved", "closed"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Ticket priority" value={priority} onChange={(event) => setPriority(event.target.value as Priority | "all")} className="admin-input"><option value="all">All priorities</option>{["low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select></div>
      {visible.length ? <AdminTable caption="Support request tickets" headers={["User", "Category", "Subject", "Submitted", "Priority", "Status", "Last update", "Assignment"]} rows={visible.map((request) => {
        const ticket = tickets[request.id];
        return { id: request.id, cells: [mask(request.email), request.type, <Link key="subject" href={`/admin/support/${request.id}`} className="font-bold text-teal-700">{request.subject}</Link>, request.createdAt, <select key="priority" value={ticket?.priority ?? "medium"} onChange={(event) => update(request.id, ticket?.status ?? "new", event.target.value as Priority)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">{["low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select>, <AdminStatus key="status">{ticket?.status ?? "new"}</AdminStatus>, ticket?.updatedAt ? new Date(ticket.updatedAt).toLocaleString() : request.createdAt, ticket?.assignedTo ?? "Unassigned"] };
      })} /> : <AdminEmptyState title="No support requests" description="Submit a learner support form to see it synchronize here." />}
    </>
  );
}
function mask(email: string) { return email.replace(/(^.).+(@.*$)/, "$1•••$2"); }
