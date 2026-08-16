"use client";

import { useEffect, useState } from "react";
import { DatabaseBackup, Download, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { AdminSettings as AdminSettingsType, FeatureFlag, MockServiceName } from "@/types/admin";
import type { JLPTLevel } from "@/types/lesson";
import {
  AdminConfirmDialog,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import { adminOperationsRepository } from "@/lib/repositories/admin-operations-repository";
import type { Database } from "@/types/database";

export function AdminSettings() {
  if (getBackendMode() === "supabase") return <BackendAdminSettings />;
  return <DemoAdminSettings />;
}

function BackendAdminSettings() {
  const [flags, setFlags] = useState<Database["public"]["Tables"]["feature_flags"]["Row"][]>([]);
  const [services, setServices] = useState<Database["public"]["Tables"]["service_status"]["Row"][]>([]);
  const [auditCount, setAuditCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const [featureFlags, serviceStatus, audit] = await Promise.all([
      adminOperationsRepository.listFeatureFlags(),
      adminOperationsRepository.listServiceStatus(),
      adminOperationsRepository.listAudit(),
    ]);
    if (featureFlags.ok) setFlags(featureFlags.data);
    else setError(featureFlags.error.message);
    if (serviceStatus.ok) setServices(serviceStatus.data);
    else setError((current) => current || serviceStatus.error.message);
    if (audit.ok) setAuditCount(audit.data.length);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function toggleFlag(flag: Database["public"]["Tables"]["feature_flags"]["Row"]) {
    setWorkingId(flag.id);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/settings/feature-flags/${flag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !flag.enabled }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) setError(body?.error ?? "Feature flag could not be updated.");
    else {
      setFlags((items) => items.map((item) => item.id === flag.id ? { ...item, enabled: !flag.enabled } : item));
      setMessage(`${flag.key} ${flag.enabled ? "disabled" : "enabled"}.`);
    }
    setWorkingId("");
  }

  async function updateService(service: Database["public"]["Tables"]["service_status"]["Row"], status: string) {
    setWorkingId(service.id);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/settings/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, detail: service.detail }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) setError(body?.error ?? "Service status could not be updated.");
    else {
      setServices((items) => items.map((item) => item.id === service.id ? { ...item, status } : item));
      setMessage(`${service.service_name} marked ${status}.`);
    }
    setWorkingId("");
  }

  function exportConfiguration() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), featureFlags: flags, serviceStatus: services }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aiko-admin-operational-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Production system configuration"
        title="Admin settings"
        description="Live operational feature flags and service-health records. All mutations on this page are admin-only and audit logged."
        actions={<Button type="button" variant="secondary" className="rounded-xl" disabled={loading} onClick={() => void load()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>}
      />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {loading && !flags.length && !services.length ? <div className="h-72 animate-pulse rounded-2xl bg-slate-100" /> : <div className="space-y-6">
        <AdminSection title="Feature flags" description="Persisted feature_flags rows. Public flags may also be readable by the learner app; this screen only changes enabled state.">
          {flags.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{flags.map((flag) => <button key={flag.id} type="button" role="switch" aria-checked={flag.enabled} disabled={workingId === flag.id} onClick={() => void toggleFlag(flag)} className="flex min-h-20 items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-teal-300 disabled:opacity-60"><span className="min-w-0"><strong className="block break-all text-sm">{flag.key}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{flag.description || "No description"} · {flag.public ? "public" : "internal"}</span></span><span className={`relative h-6 w-11 shrink-0 rounded-full transition ${flag.enabled ? "bg-teal-600" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition ${flag.enabled ? "left-6" : "left-1"}`} /></span></button>)}</div> : <p className="py-8 text-center text-sm text-slate-500">No feature flags are configured.</p>}
        </AdminSection>

        <AdminSection title="Service status" description="Operational status records shown to administrators; changing one records an audit event.">
          {services.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{services.map((service) => <label key={service.id} className="rounded-xl border border-slate-200 p-4"><span className="mb-2 flex items-center justify-between gap-2 text-sm font-bold"><span className="truncate">{service.service_name}</span><AdminStatus>{service.status}</AdminStatus></span><p className="mb-3 min-h-10 text-xs leading-5 text-slate-500">{service.detail || "No service detail."}</p><select value={service.status} disabled={workingId === service.id} onChange={(event) => void updateService(service, event.target.value)} className="admin-input"><option value="operational">operational</option><option value="degraded">degraded</option><option value="offline">offline</option><option value="maintenance">maintenance</option></select></label>)}</div> : <p className="py-8 text-center text-sm text-slate-500">No service-status rows are configured.</p>}
        </AdminSection>

        <AdminSection title="Security & audit posture">
          <div className="grid gap-4 md:grid-cols-3"><Info icon={<ShieldCheck className="size-5" />} label="Mutation boundary" value="Server-authorized" /><Info icon={<DatabaseBackup className="size-5" />} label="Audit rows loaded" value={auditCount.toString()} /><Info icon={<Download className="size-5" />} label="Configuration export" value="Local JSON only" /></div>
          <Button type="button" variant="secondary" className="mt-5 rounded-xl" onClick={exportConfiguration}><Download className="size-4" />Export operational config</Button>
        </AdminSection>

        <AdminSection title="Controls intentionally unavailable in production" description="These were local prototype buttons and are not safe production operations.">
          <ul className="grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-2"><li className="rounded-xl bg-slate-50 p-4"><strong className="block text-slate-800">Reset all admin data</strong>No production database reset is exposed through the browser.</li><li className="rounded-xl bg-slate-50 p-4"><strong className="block text-slate-800">Clear generated content</strong>Generated lessons require explicit record-level workflows rather than bulk local deletion.</li><li className="rounded-xl bg-slate-50 p-4"><strong className="block text-slate-800">Rebuild mock indexes</strong>Supabase/Postgres indexing is deployment infrastructure, not a browser button.</li><li className="rounded-xl bg-slate-50 p-4"><strong className="block text-slate-800">Local content defaults</strong>There is no production settings table for these defaults yet, so the UI does not pretend they are persisted.</li></ul>
        </AdminSection>
      </div>}
    </>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4"><span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">{icon}</span><span><span className="block text-xs text-slate-500">{label}</span><strong className="text-sm">{value}</strong></span></div>;
}

function DemoAdminSettings() {
  const settings = useAdminStore((state) => state.settings);
  const audit = useAdminStore((state) => state.auditLog);
  const validations = useAdminStore((state) => state.validations);
  const update = useAdminStore((state) => state.updateSettings);
  const toggle = useAdminStore((state) => state.toggleFeatureFlag);
  const reset = useAdminStore((state) => state.resetAdminData);
  const rebuild = useAdminStore((state) => state.rebuildIndexes);
  const clearGenerated = useAdminStore((state) => state.clearGeneratedContent);
  const rebuiltAt = useAdminStore((state) => state.indexRebuiltAt);
  const [draft, setDraft] = useState(settings);
  const [confirm, setConfirm] = useState<"reset" | "generated" | null>(null);
  const [message, setMessage] = useState("");
  const flags = Object.keys(settings.featureFlags) as FeatureFlag[];
  const services = Object.keys(settings.serviceStatus) as MockServiceName[];

  function exportData() {
    const state = useAdminStore.getState();
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), settings: state.settings, curriculumItems: state.curriculumItems, grammarRecords: state.grammarRecords, kanjiRecords: state.kanjiRecords, vocabularyRecords: state.vocabularyRecords, imageAssets: state.imageAssets, audioAssets: state.audioAssets, validations, auditLog: audit }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aiko-admin-demo-data.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Demo admin data exported.");
  }

  return (
    <>
      <AdminPageHeader eyebrow="Demo system configuration" title="Admin settings" description="Local content defaults, feature flags, mock service states, and deterministic data controls for development." />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      <div className="space-y-6">
        <AdminSection title="Content defaults"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Field label="Default lesson length"><select value={draft.defaultLessonLength} onChange={(event) => setDraft({ ...draft, defaultLessonLength: Number(event.target.value) as AdminSettingsType["defaultLessonLength"] })} className="admin-input">{[15, 30, 45, 60].map((item) => <option key={item} value={item}>{item} minutes</option>)}</select></Field><Field label="Generation limit / day"><input type="number" min={1} value={draft.generationLimitPerDay} onChange={(event) => setDraft({ ...draft, generationLimitPerDay: Number(event.target.value) })} className="admin-input" /></Field><Field label="Validation threshold"><input type="number" min={0} max={100} value={draft.validationThreshold} onChange={(event) => setDraft({ ...draft, validationThreshold: Number(event.target.value) })} className="admin-input" /></Field><Field label="Publish behavior"><select value={draft.publishBehavior} onChange={(event) => setDraft({ ...draft, publishBehavior: event.target.value as AdminSettingsType["publishBehavior"] })} className="admin-input"><option value="manual">Manual</option><option value="after approval">After approval</option></select></Field><div><span className="field-label">Allowed JLPT levels</span><div className="flex flex-wrap gap-2">{(["N5", "N4", "N3", "N2", "N1"] as JLPTLevel[]).map((level) => <label key={level} className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={draft.allowedLevels.includes(level)} onChange={(event) => setDraft({ ...draft, allowedLevels: event.target.checked ? [...draft.allowedLevels, level] : draft.allowedLevels.filter((item) => item !== level) })} className="accent-teal-700" />{level}</label>)}</div></div></div><Button type="button" className="mt-5 rounded-xl" onClick={() => { update(draft); setMessage("Demo content defaults saved."); }}><Save className="size-4" />Save defaults</Button></AdminSection>
        <AdminSection title="Feature flags"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{flags.map((flag) => <button key={flag} type="button" role="switch" aria-checked={settings.featureFlags[flag]} onClick={() => toggle(flag)} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 p-4 text-left"><span className="text-sm font-bold">{humanize(flag)}</span><span className={`relative h-6 w-11 rounded-full transition ${settings.featureFlags[flag] ? "bg-teal-600" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition ${settings.featureFlags[flag] ? "left-6" : "left-1"}`} /></span></button>)}</div></AdminSection>
        <AdminSection title="Mock service status"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{services.map((service) => <label key={service} className="rounded-xl border border-slate-200 p-4"><span className="mb-2 flex items-center justify-between text-sm font-bold capitalize">{service}<AdminStatus>{draft.serviceStatus[service]}</AdminStatus></span><select value={draft.serviceStatus[service]} onChange={(event) => { const next = { ...draft, serviceStatus: { ...draft.serviceStatus, [service]: event.target.value as AdminSettingsType["serviceStatus"][MockServiceName] } }; setDraft(next); update({ serviceStatus: next.serviceStatus }); }} className="admin-input"><option>operational</option><option>degraded</option><option>offline</option></select></label>)}</div></AdminSection>
        <AdminSection title="Demo data controls"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="rounded-xl" onClick={exportData}><Download className="size-4" />Export demo data</Button><Button type="button" variant="secondary" className="rounded-xl" onClick={() => { rebuild(); setMessage("Demo indexes rebuilt."); }}><RefreshCw className="size-4" />Rebuild indexes</Button><Button type="button" variant="secondary" className="rounded-xl text-red-700" onClick={() => setConfirm("generated")}><Trash2 className="size-4" />Clear generated content</Button><Button type="button" variant="secondary" className="rounded-xl text-red-700" onClick={() => setConfirm("reset")}><DatabaseBackup className="size-4" />Reset demo admin data</Button></div>{rebuiltAt && <p className="mt-4 text-xs text-slate-500">Indexes last rebuilt: {new Date(rebuiltAt).toLocaleString()}</p>}</AdminSection>
      </div>
      <AdminConfirmDialog open={confirm === "generated"} title="Clear all demo generated content?" description="Generated lesson records and validation results will be removed from local persistence." confirmLabel="Clear generated content" onClose={() => setConfirm(null)} onConfirm={() => { clearGenerated(); setMessage("Demo generated content cleared."); }} />
      <AdminConfirmDialog open={confirm === "reset"} title="Reset admin demo data?" description="Local admin edits, validations, curriculum, metadata, tickets, settings, and audit entries will return to deterministic defaults." confirmLabel="Reset demo data" onClose={() => setConfirm(null)} onConfirm={() => { reset(); setDraft(useAdminStore.getState().settings); setMessage("Admin demo data reset."); }} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="field-label">{label}</span>{children}</label>;
}

function humanize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}
