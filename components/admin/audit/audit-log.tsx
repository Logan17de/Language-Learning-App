"use client";

import { useMemo, useState } from "react";
import { Search, ScrollText } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { AuditEntityType } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";

export function AuditLog() {
  const entries = useAdminStore((state) => state.auditLog);
  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState<AuditEntityType | "all">("all");
  const [action, setAction] = useState("all");
  const actions = [...new Set(entries.map((item) => item.action))];
  const visible = useMemo(() => entries.filter((item) => (!query || `${item.action} ${item.entityId} ${item.summary} ${item.adminUser}`.toLowerCase().includes(query.toLowerCase())) && (entity === "all" || item.entityType === entity) && (action === "all" || item.action === action)), [action, entity, entries, query]);
  return (
    <>
      <AdminPageHeader eyebrow="Operational accountability" title="Audit log" description="Every important local admin mutation is recorded centrally with actor, entity, timestamp, and a concise summary." />
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_13rem_15rem]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search audit log" value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Action, entity, admin, or summary" /></label><select aria-label="Audit entity type" value={entity} onChange={(event) => setEntity(event.target.value as AuditEntityType | "all")} className="admin-input"><option value="all">All entities</option>{["lesson", "validation", "curriculum", "grammar", "kanji", "vocabulary", "image", "audio", "user", "subscription", "report", "support", "settings", "data"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Audit action" value={action} onChange={(event) => setAction(event.target.value)} className="admin-input"><option value="all">All actions</option>{actions.map((item) => <option key={item}>{item}</option>)}</select></div>
      {visible.length ? <AdminTable caption="Central admin audit log" headers={["Timestamp", "Admin user", "Action", "Entity type", "Entity ID", "Summary"]} rows={visible.map((item) => ({ id: item.id, cells: [new Date(item.timestamp).toLocaleString(), item.adminUser, <strong key="action" className="capitalize">{item.action}</strong>, <AdminStatus key="entity">{item.entityType}</AdminStatus>, <code key="id" className="text-xs">{item.entityId}</code>, item.summary] }))} /> : <AdminEmptyState title="No matching audit entries" description={entries.length ? "Change the audit filters." : "Perform an admin mutation to create the first centrally logged entry."} />}
      {!entries.length && <div className="mt-5 rounded-xl bg-slate-100 p-4 text-sm text-slate-500"><ScrollText className="mr-2 inline size-4" /> Sign-in and read-only navigation are intentionally not audited; mutations are.</div>}
    </>
  );
}
