"use client";

import { useState } from "react";
import { Download, RotateCcw, ShieldOff } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { SubscriptionPlan } from "@/types/app-preferences";
import { AdminEmptyState, AdminPageHeader, AdminSection, AdminStatus } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

export function UserDetail({ userId }: { userId: string }) {
  const user = useAdminStore((state) => state.users.find((item) => item.id === userId));
  const subscriptions = useAdminStore((state) => state.subscriptions.filter((item) => item.userId === userId));
  const audit = useAdminStore((state) => state.auditLog.filter((item) => item.entityId === userId));
  const changePlan = useAdminStore((state) => state.changeUserPlan);
  const updateUser = useAdminStore((state) => state.updateUser);
  const resetProgress = useAdminStore((state) => state.resetUserProgress);
  const learner = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const reviewHistory = useAppStore((state) => state.reviewHistory);
  const generated = useAppStore((state) => state.generatedLessons);
  const reports = useAppStore((state) => state.lessonReports);
  const support = useAppStore((state) => state.supportRequests);
  const settings = useAppStore((state) => state.settings);
  const [message, setMessage] = useState("");
  if (!user) return <AdminEmptyState title="User not found" description="The mock user ID is invalid or no longer available." />;
  const isPrimary = user.id === learner.id;

  return (
    <>
      <AdminPageHeader eyebrow="User detail" title={user.displayName} description={`${user.id} · ${mask(user.email)} · only operationally necessary mock information is shown.`} actions={<AdminStatus>{user.status}</AdminStatus>} />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      <div className="mb-6 flex flex-wrap gap-2"><select aria-label="Change user plan" value={user.subscription} onChange={(event) => { changePlan(user.id, event.target.value as SubscriptionPlan); setMessage("Plan changed and learner gating synchronized where applicable."); }} className="admin-input w-44"><option>free</option><option>premium</option></select><Button type="button" variant="secondary" className="rounded-xl" onClick={() => { updateUser({ ...user, status: user.status === "suspended" ? "active" : "suspended" }, user.status === "suspended" ? "user restored" : "user suspended"); setMessage("Account status updated."); }}><ShieldOff className="size-4" /> {user.status === "suspended" ? "Restore" : "Suspend"}</Button><Button type="button" variant="secondary" className="rounded-xl" onClick={() => { resetProgress(user.id); setMessage("Mock learner progress reset."); }}><RotateCcw className="size-4" /> Reset progress</Button><Button type="button" variant="secondary" className="rounded-xl" onClick={() => exportSafe(user)}><Download className="size-4" /> Export data</Button></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <AdminSection title="Profile and preferences"><dl className="grid gap-4 sm:grid-cols-2">{[["Level", user.level], ["Plan", user.subscription], ["Joined", user.joinDate], ["Last active", user.lastActive], ["Streak", `${user.streak} days`], ["XP", user.xp.toLocaleString()], ["Lesson length", isPrimary ? `${settings.lessonLength} min` : "30 min"], ["Focus", isPrimary ? settings.preferredFocus : "balanced"]].map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 font-semibold capitalize">{value}</dd></div>)}</dl></AdminSection>
        <AdminSection title="Learner mastery"><div className="grid gap-3 sm:grid-cols-2">{[["Kanji recognition", isPrimary ? progress.kanjiRecognition : 72], ["Pronunciation", isPrimary ? progress.pronunciation : 68], ["Grammar understanding", isPrimary ? progress.grammarUnderstanding : 74], ["Grammar production", isPrimary ? progress.grammarProduction : 61]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block text-2xl">{value}%</strong></div>)}</div></AdminSection>
        <AdminSection title="Lesson and review history"><p className="text-sm text-slate-600">{user.lessonsCompleted} lessons completed · {isPrimary ? reviewHistory.length : 9} review sessions</p>{isPrimary && <div className="mt-4 space-y-2">{progress.recentLessons.map((item) => <div key={item.lessonId} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>{item.title}</span><strong>{item.score}%</strong></div>)}</div>}</AdminSection>
        <AdminSection title="Generated lessons"><p className="text-3xl font-bold">{isPrimary ? generated.length : 2}</p><p className="mt-1 text-sm text-slate-500">Custom lessons linked to this learner.</p></AdminSection>
        <AdminSection title="Subscription history">{subscriptions.map((record) => <div key={record.id} className="mb-3 rounded-xl border border-slate-100 p-4"><div className="flex justify-between"><strong className="capitalize">{record.plan} · {record.billingInterval}</strong><AdminStatus>{record.status}</AdminStatus></div><p className="mt-2 text-xs text-slate-500">{record.startDate} {record.renewalDate ? `→ ${record.renewalDate}` : ""}</p></div>)}</AdminSection>
        <AdminSection title="Reports and support"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><strong className="text-2xl">{isPrimary ? reports.length : user.reportCount}</strong><span className="block text-xs text-slate-500">Lesson reports</span></div><div className="rounded-xl bg-slate-50 p-4"><strong className="text-2xl">{isPrimary ? support.length : user.supportRequestCount}</strong><span className="block text-xs text-slate-500">Support requests</span></div></div></AdminSection>
        <AdminSection title="Audit history" className="xl:col-span-2">{audit.length ? audit.map((item) => <div key={item.id} className="border-b border-slate-100 py-3 last:border-0"><strong className="capitalize">{item.action}</strong><p className="text-sm text-slate-500">{item.summary}</p></div>) : <p className="py-6 text-center text-sm text-slate-500">No admin action recorded for this user.</p>}</AdminSection>
      </div>
    </>
  );
}

function mask(email: string) { return email.replace(/(^.).+(@.*$)/, "$1•••$2"); }
function exportSafe(user: { id: string; displayName: string; level: string; subscription: string; joinDate: string; status: string }) { const blob = new Blob([JSON.stringify(user, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${user.id}.json`; anchor.click(); URL.revokeObjectURL(url); }
