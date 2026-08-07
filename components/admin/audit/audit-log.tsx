"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ScrollText } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { AuditEntityType } from "@/types/admin";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
  AdminTable,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import { adminOperationsRepository } from "@/lib/repositories/admin-operations-repository";
import { adminUserRepository } from "@/lib/repositories/admin-user-repository";
import type { Database, ProfileRow } from "@/types/database";

export function AuditLog() {
  if (getBackendMode() === "supabase") return <BackendAuditLog />;
  return <DemoAuditLog />;
}

function BackendAuditLog() {
  const [entries, setEntries] = useState<Database["public"]["Tables"]["audit_logs"]["Row"][]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [audit, users] = await Promise.all([
      adminOperationsRepository.listAudit(),
      adminUserRepository.list(),
    ]);
    if (audit.ok) setEntries(audit.data);
    else setError(audit.error.message);
    if (users.ok) setProfiles(users.data);
    else setError((current) => current || users.error.message);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const actions = useMemo(() => [...new Set(entries.map((item) => item.action))].sort(), [entries]);
  const entities = useMemo(() => [...new Set(entries.map((item) => item.entity_type))].sort(), [entries]);
  const visible = useMemo(() => entries.filter((item) => {
    const actor = profileById.get(item.actor_user_id)?.display_name || item.actor_user_id;
    const haystack = `${item.action} ${item.entity_type} ${item.entity_id} ${actor} ${JSON.stringify(item.metadata)}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (entity === "all" || item.entity_type === entity) && (action === "all" || item.action === action);
  }), [action, entity, entries, profileById, query]);

  return (
    <>
      <AdminPageHeader
        eyebrow="Operational accountability"
        title="Audit log"
        description="Persisted admin mutations from Supabase, including actor, entity, timestamp, before/after summaries, and operation metadata."
        actions={<Button type="button" variant="secondary" className="rounded-xl" disabled={loading} onClick={() => void load()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>}
      />
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_13rem_15rem]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search audit log" value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Action, entity, actor, or metadata" /></label><select aria-label="Audit entity type" value={entity} onChange={(event) => setEntity(event.target.value)} className="admin-input"><option value="all">All entities</option>{entities.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><select aria-label="Audit action" value={action} onChange={(event) => setAction(event.target.value)} className="admin-input"><option value="all">All actions</option>{actions.map((item) => <option key={item}>{item.replaceAll("_", " ")}</option>)}</select></div>
      {loading && !entries.length ? <div className="h-72 animate-pulse rounded-2xl bg-slate-100" /> : visible.length ? <AdminTable caption="Persisted admin audit log" headers={["Timestamp", "Actor", "Action", "Entity type", "Entity ID", "Metadata"]} rows={visible.map((item) => ({ id: item.id, cells: [new Date(item.created_at).toLocaleString(), profileById.get(item.actor_user_id)?.display_name || item.actor_user_id.slice(0, 12), <strong key="action" className="capitalize">{item.action.replaceAll("_", " ")}</strong>, <AdminStatus key="entity">{item.entity_type}</AdminStatus>, <code key="id" className="text-xs">{item.entity_id}</code>, <span key="metadata" className="block max-w-72 truncate text-xs text-slate-500">{metadataSummary(item.metadata)}</span>] }))} /> : <AdminEmptyState title="No matching audit entries" description={entries.length ? "Change the audit filters." : "No persisted admin mutation has been recorded yet."} />}
      {!entries.length && !loading && <div className="mt-5 rounded-xl bg-slate-100 p-4 text-sm text-slate-500"><ScrollText className="mr-2 inline size-4" />Sign-in and read-only navigation are intentionally not audited; privileged mutations are.</div>}
    </>
  );
}

function metadataSummary(metadata: Database["public"]["Tables"]["audit_logs"]["Row"]["metadata"]) {
  if (typeof metadata !== "object" || metadata === null) return "—";
  const text = JSON.stringify(metadata);
  return text === "{}" ? "—" : text;
}

function DemoAuditLog() {
  const entries = useAdminStore((state) => state.auditLog);
  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState<AuditEntityType | "all">("all");
  const [action, setAction] = useState("all");
  const actions = [...new Set(entries.map((item) => item.action))];
  const visible = useMemo(() => entries.filter((item) => (!query || `${item.action} ${item.entityId} ${item.summary} ${item.adminUser}`.toLowerCase().includes(query.toLowerCase())) && (entity === "all" || item.entityType === entity) && (action === "all" || item.action === action)), [action, entity, entries, query]);
  return (
    <>
      <AdminPageHeader eyebrow="Demo accountability" title="Audit log" description="Local demo mutations recorded in the admin Zustand store." />
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_13rem_15rem]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search audit log" value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Action, entity, admin, or summary" /></label><select aria-label="Audit entity type" value={entity} onChange={(event) => setEntity(event.target.value as AuditEntityType | "all")} className="admin-input"><option value="all">All entities</option>{["lesson", "validation", "curriculum", "grammar", "kanji", "vocabulary", "image", "audio", "user", "subscription", "report", "support", "settings", "data"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Audit action" value={action} onChange={(event) => setAction(event.target.value)} className="admin-input"><option value="all">All actions</option>{actions.map((item) => <option key={item}>{item}</option>)}</select></div>
      {visible.length ? <AdminTable caption="Demo admin audit log" headers={["Timestamp", "Admin user", "Action", "Entity type", "Entity ID", "Summary"]} rows={visible.map((item) => ({ id: item.id, cells: [new Date(item.timestamp).toLocaleString(), item.adminUser, <strong key="action" className="capitalize">{item.action}</strong>, <AdminStatus key="entity">{item.entityType}</AdminStatus>, <code key="id" className="text-xs">{item.entityId}</code>, item.summary] }))} /> : <AdminEmptyState title="No matching audit entries" description={entries.length ? "Change the audit filters." : "Perform a demo admin mutation to create the first entry."} />}
    </>
  );
}
