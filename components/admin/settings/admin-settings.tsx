"use client";

import { useState } from "react";
import { DatabaseBackup, Download, RefreshCw, Save, Trash2 } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { AdminSettings as AdminSettingsType, FeatureFlag, MockServiceName } from "@/types/admin";
import type { JLPTLevel } from "@/types/lesson";
import { AdminConfirmDialog, AdminPageHeader, AdminSection, AdminStatus } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

export function AdminSettings() {
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
    anchor.download = "aiko-admin-data.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Mock admin data exported.");
  }

  return (
    <>
      <AdminPageHeader eyebrow="System configuration" title="Admin settings" description="Persist content defaults, feature flags, mock service states, and destructive data controls locally." />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      <div className="space-y-6">
        <AdminSection title="Content defaults" description="Defaults used by future deterministic lesson drafts.">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Field label="Default lesson length"><select value={draft.defaultLessonLength} onChange={(event) => setDraft({ ...draft, defaultLessonLength: Number(event.target.value) as AdminSettingsType["defaultLessonLength"] })} className="admin-input">{[15, 30, 45, 60].map((item) => <option key={item} value={item}>{item} minutes</option>)}</select></Field><Field label="Generation limit / day"><input type="number" min={1} value={draft.generationLimitPerDay} onChange={(event) => setDraft({ ...draft, generationLimitPerDay: Number(event.target.value) })} className="admin-input" /></Field><Field label="Validation threshold"><input type="number" min={0} max={100} value={draft.validationThreshold} onChange={(event) => setDraft({ ...draft, validationThreshold: Number(event.target.value) })} className="admin-input" /></Field><Field label="Publish behavior"><select value={draft.publishBehavior} onChange={(event) => setDraft({ ...draft, publishBehavior: event.target.value as AdminSettingsType["publishBehavior"] })} className="admin-input"><option value="manual">Manual</option><option value="after approval">After approval</option></select></Field><div><span className="field-label">Allowed JLPT levels</span><div className="flex flex-wrap gap-2">{(["N5", "N4", "N3", "N2", "N1"] as JLPTLevel[]).map((level) => <label key={level} className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={draft.allowedLevels.includes(level)} onChange={(event) => setDraft({ ...draft, allowedLevels: event.target.checked ? [...draft.allowedLevels, level] : draft.allowedLevels.filter((item) => item !== level) })} className="accent-teal-700" />{level}</label>)}</div></div></div><Button type="button" className="mt-5 rounded-xl" onClick={() => { update(draft); setMessage("Content defaults saved."); }}><Save className="size-4" /> Save defaults</Button>
        </AdminSection>
        <AdminSection title="Feature flags" description="Mock switches are centralized and audit logged."><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{flags.map((flag) => <button key={flag} type="button" role="switch" aria-checked={settings.featureFlags[flag]} onClick={() => toggle(flag)} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 p-4 text-left"><span className="text-sm font-bold">{humanize(flag)}</span><span className={`relative h-6 w-11 rounded-full transition ${settings.featureFlags[flag] ? "bg-teal-600" : "bg-slate-300"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition ${settings.featureFlags[flag] ? "left-6" : "left-1"}`} /></span></button>)}</div></AdminSection>
        <AdminSection title="Mock service status" description="These indicators do not contact any external service."><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{services.map((service) => <label key={service} className="rounded-xl border border-slate-200 p-4"><span className="mb-2 flex items-center justify-between text-sm font-bold capitalize">{service}<AdminStatus>{draft.serviceStatus[service]}</AdminStatus></span><select value={draft.serviceStatus[service]} onChange={(event) => { const next = { ...draft, serviceStatus: { ...draft.serviceStatus, [service]: event.target.value as AdminSettingsType["serviceStatus"][MockServiceName] } }; setDraft(next); update({ serviceStatus: next.serviceStatus }); }} className="admin-input"><option>operational</option><option>degraded</option><option>offline</option></select></label>)}</div></AdminSection>
        <AdminSection title="Data controls" description="Export, rebuild, or clear deterministic local admin state. Destructive actions require confirmation."><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="rounded-xl" onClick={exportData}><Download className="size-4" /> Export admin data</Button><Button type="button" variant="secondary" className="rounded-xl" onClick={() => { rebuild(); setMessage("Mock lesson and asset indexes rebuilt."); }}><RefreshCw className="size-4" /> Rebuild indexes</Button><Button type="button" variant="secondary" className="rounded-xl text-red-700" onClick={() => setConfirm("generated")}><Trash2 className="size-4" /> Clear generated content</Button><Button type="button" variant="secondary" className="rounded-xl text-red-700" onClick={() => setConfirm("reset")}><DatabaseBackup className="size-4" /> Reset admin data</Button></div>{rebuiltAt && <p className="mt-4 text-xs text-slate-500">Indexes last rebuilt: {new Date(rebuiltAt).toLocaleString()}</p>}</AdminSection>
      </div>
      <AdminConfirmDialog open={confirm === "generated"} title="Clear all generated content?" description="Generated lesson records, validation results, and learner-generated canonical content will be removed from local persistence." confirmLabel="Clear generated content" onClose={() => setConfirm(null)} onConfirm={() => { clearGenerated(); setMessage("Generated content cleared."); }} />
      <AdminConfirmDialog open={confirm === "reset"} title="Reset admin mock data?" description="Admin content edits, validations, curriculum, metadata, tickets, settings, and audit entries will return to deterministic defaults. The current admin session remains active." confirmLabel="Reset admin data" onClose={() => setConfirm(null)} onConfirm={() => { reset(); setDraft(useAdminStore.getState().settings); setMessage("Admin mock data reset."); }} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="field-label">{label}</span>{children}</label>; }
function humanize(value: string) { return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()); }
