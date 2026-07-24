"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, RotateCcw, Search, ShieldOff, Trash2 } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { AdminUserRecord, AdminUserStatus } from "@/types/admin";
import type { SubscriptionPlan } from "@/types/app-preferences";
import { AdminConfirmDialog, AdminEmptyState, AdminPageHeader, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";

export function UserManagement() {
  const users = useAdminStore((state) => state.users);
  const updateUser = useAdminStore((state) => state.updateUser);
  const changePlan = useAdminStore((state) => state.changeUserPlan);
  const resetProgress = useAdminStore((state) => state.resetUserProgress);
  const deleteUser = useAdminStore((state) => state.deleteUser);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminUserStatus | "all">("all");
  const [plan, setPlan] = useState<SubscriptionPlan | "all">("all");
  const [confirm, setConfirm] = useState<{ action: "reset" | "delete"; user: AdminUserRecord } | null>(null);
  const visible = useMemo(() => users.filter((user) => (!query || `${user.displayName} ${user.email}`.toLowerCase().includes(query.toLowerCase())) && (status === "all" || user.status === status) && (plan === "all" || user.subscription === plan)), [plan, query, status, users]);

  function exportUser(user: AdminUserRecord) {
    const safe = { ...user, email: user.email.replace(/(^.).+(@.*$)/, "$1***$2") };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${user.id}-export.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <AdminPageHeader eyebrow="Learner operations" title="User management" description="Manage minimal mock learner context without exposing unnecessary sensitive information." />
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_12rem_12rem]"><label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search users" value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Display name or email" /></label><select aria-label="Account status" value={status} onChange={(event) => setStatus(event.target.value as AdminUserStatus | "all")} className="admin-input"><option value="all">All accounts</option><option>active</option><option>suspended</option><option>deleted</option></select><select aria-label="Subscription plan" value={plan} onChange={(event) => setPlan(event.target.value as SubscriptionPlan | "all")} className="admin-input"><option value="all">All plans</option><option>free</option><option>premium</option></select></div>
      {visible.length ? <AdminTable caption="Admin user records" headers={["User", "Level", "Subscription", "Joined", "Last active", "Streak", "Lessons", "XP", "Support", "Reports", "Status", "Actions"]} rows={visible.map((user) => ({ id: user.id, cells: [<div key="user"><Link href={`/admin/users/${user.id}`} className="font-bold text-teal-700">{user.displayName}</Link><p className="text-xs text-slate-500">{maskEmail(user.email)}</p></div>, user.level, <select key="plan" aria-label={`Plan for ${user.displayName}`} value={user.subscription} onChange={(event) => changePlan(user.id, event.target.value as SubscriptionPlan)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"><option>free</option><option>premium</option></select>, user.joinDate, user.lastActive, user.streak, user.lessonsCompleted, user.xp.toLocaleString(), user.supportRequestCount, user.reportCount, <AdminStatus key="status">{user.status}</AdminStatus>, <div key="actions" className="flex min-w-max gap-1"><Icon label={user.status === "suspended" ? "Restore user" : "Suspend user"} onClick={() => updateUser({ ...user, status: user.status === "suspended" ? "active" : "suspended" }, user.status === "suspended" ? "user restored" : "user suspended")}><ShieldOff className="size-4" /></Icon><Icon label="Reset progress" onClick={() => setConfirm({ action: "reset", user })}><RotateCcw className="size-4" /></Icon><Icon label="Export user data" onClick={() => exportUser(user)}><Download className="size-4" /></Icon><Icon label="Delete mock user" onClick={() => setConfirm({ action: "delete", user })} danger><Trash2 className="size-4" /></Icon></div>] }))} /> : <AdminEmptyState title="No users found" description="Change the search or filters." />}
      <AdminConfirmDialog open={Boolean(confirm)} title={confirm?.action === "delete" ? "Delete mock user?" : "Reset learner progress?"} description={confirm?.action === "delete" ? `${confirm?.user.displayName} will be marked deleted in local admin state.` : `${confirm?.user.displayName}'s XP, streak, and completion counts will reset. For Hana, learner progress also resets.`} confirmLabel={confirm?.action === "delete" ? "Delete user" : "Reset progress"} onClose={() => setConfirm(null)} onConfirm={() => { if (!confirm) return; if (confirm.action === "delete") deleteUser(confirm.user.id); else resetProgress(confirm.user.id); }} />
    </>
  );
}

function maskEmail(email: string): string { return email.replace(/(^.).+(@.*$)/, "$1•••$2"); }
function Icon({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) { return <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid size-9 place-items-center rounded-lg ${danger ? "text-red-600 hover:bg-red-50" : "text-slate-500 hover:bg-slate-100"}`}>{children}</button>; }
