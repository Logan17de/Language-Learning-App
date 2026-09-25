"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, RefreshCw, RotateCcw, Search, ShieldOff, Trash2 } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { AdminUserRecord, AdminUserStatus } from "@/types/admin";
import type { SubscriptionPlan } from "@/types/app-preferences";
import {
  AdminConfirmDialog,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
  AdminTable,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import {
  adminUserRepository,
  type AdminUserListItem,
} from "@/lib/repositories/admin-user-repository";

export function UserManagement() {
  const localUsers = useAdminStore((state) => state.users);
  const updateUserLocal = useAdminStore((state) => state.updateUser);
  const changePlanLocal = useAdminStore((state) => state.changeUserPlan);
  const resetProgressLocal = useAdminStore((state) => state.resetUserProgress);
  const deleteUserLocal = useAdminStore((state) => state.deleteUser);
  const backendMode = getBackendMode() === "supabase";
  const [backendRows, setBackendRows] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(backendMode);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadUsers() {
    if (!backendMode) return;
    setLoading(true);
    setError("");
    const result = await adminUserRepository.listWithStats();
    if (result.ok) setBackendRows(result.data);
    else setError(result.error.message);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [backendMode]);

  const users: AdminUserRecord[] = backendMode
    ? backendRows.map(({ profile, lessonsCompleted, supportRequestCount, reportCount, lastActive }) => ({
        id: profile.id,
        displayName: profile.display_name,
        email: profile.email,
        level: profile.current_jlpt_level,
        subscription: profile.subscription_plan === "free" ? "free" : "premium",
        joinDate: profile.created_at.slice(0, 10),
        lastActive: lastActive ?? "No activity in 30d",
        streak: profile.streak_days,
        lessonsCompleted,
        xp: profile.xp,
        supportRequestCount,
        reportCount,
        status: profile.status,
      }))
    : localUsers;

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminUserStatus | "all">("all");
  const [plan, setPlan] = useState<SubscriptionPlan | "all">("all");
  const [confirm, setConfirm] = useState<{ action: "reset" | "delete"; user: AdminUserRecord } | null>(null);

  async function updateUser(user: AdminUserRecord, action: string) {
    setError("");
    setMessage("");
    if (!backendMode) {
      updateUserLocal(user, action);
      return;
    }
    const response = await fetch(`/api/admin/users/${user.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: user.status }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Account status could not be updated.");
      return;
    }
    setBackendRows((items) => items.map((item) => item.profile.id === user.id ? { ...item, profile: { ...item.profile, status: user.status } } : item));
    setMessage(action);
  }

  async function changePlan(userId: string, nextPlan: SubscriptionPlan) {
    setError("");
    setMessage("");
    if (!backendMode) {
      changePlanLocal(userId, nextPlan);
      return;
    }
    const response = await fetch(`/api/admin/subscriptions/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: nextPlan === "premium" ? "premium_monthly" : "free", status: "active" }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Subscription could not be updated.");
      return;
    }
    setBackendRows((items) => items.map((item) => item.profile.id === userId ? { ...item, profile: { ...item.profile, subscription_plan: nextPlan === "premium" ? "premium_monthly" : "free" } } : item));
    setMessage("Subscription updated.");
  }

  async function resetProgress(userId: string) {
    setError("");
    setMessage("");
    if (!backendMode) {
      resetProgressLocal(userId);
      return;
    }
    const response = await fetch(`/api/admin/users/${userId}/reset-progress`, { method: "POST" });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Progress could not be reset.");
      return;
    }
    setBackendRows((items) => items.map((item) => item.profile.id === userId ? {
      ...item,
      lessonsCompleted: 0,
      lastActive: null,
      profile: { ...item.profile, xp: 0, streak_days: 0, longest_streak: 0, total_study_minutes: 0 },
    } : item));
    setMessage("Learner progress reset.");
  }

  function deleteUser(userId: string) {
    if (!backendMode) {
      deleteUserLocal(userId);
      return;
    }
    const user = users.find((item) => item.id === userId);
    if (user) void updateUser({ ...user, status: "deleted" }, "Account marked deleted.");
  }

  const visible = useMemo(
    () => users.filter((user) =>
      (!query || `${user.displayName} ${user.email}`.toLowerCase().includes(query.toLowerCase())) &&
      (status === "all" || user.status === status) &&
      (plan === "all" || user.subscription === plan)),
    [plan, query, status, users],
  );

  function exportUser(user: AdminUserRecord) {
    const safe = { ...user, email: user.email.replace(/(^.).+(@.*$)/, "$1***$2") };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${user.id}-admin-summary.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Learner operations"
        title="User management"
        description={backendMode ? "Live learner accounts with recent activity, completion, report, support, subscription, and account-state controls." : "Deterministic local learner records for demo mode."}
        actions={backendMode ? <Button type="button" variant="secondary" className="rounded-xl" disabled={loading} onClick={() => void loadUsers()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button> : undefined}
      />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_12rem_12rem]">
        <label className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search users" value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input pl-9" placeholder="Display name or email" /></label>
        <select aria-label="Account status" value={status} onChange={(event) => setStatus(event.target.value as AdminUserStatus | "all")} className="admin-input"><option value="all">All accounts</option><option>active</option><option>suspended</option><option>deleted</option></select>
        <select aria-label="Subscription plan" value={plan} onChange={(event) => setPlan(event.target.value as SubscriptionPlan | "all")} className="admin-input"><option value="all">All plans</option><option>free</option><option>premium</option></select>
      </div>

      {loading && !backendRows.length ? (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading users" />
      ) : visible.length ? (
        <AdminTable
          caption="Admin user records"
          headers={["User", "Level", "Subscription", "Joined", "Last active", "Streak", "Lessons", "XP", "Support", "Reports", "Status", "Actions"]}
          rows={visible.map((user) => ({
            id: user.id,
            cells: [
              <div key="user"><Link href={`/admin/users/${user.id}`} className="font-bold text-teal-700">{user.displayName}</Link><p className="text-xs text-slate-500">{maskEmail(user.email)}</p></div>,
              user.level,
              <select key="plan" aria-label={`Plan for ${user.displayName}`} value={user.subscription} onChange={(event) => void changePlan(user.id, event.target.value as SubscriptionPlan)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"><option>free</option><option>premium</option></select>,
              user.joinDate,
              user.lastActive,
              user.streak,
              user.lessonsCompleted,
              user.xp.toLocaleString(),
              user.supportRequestCount,
              user.reportCount,
              <AdminStatus key="status">{user.status}</AdminStatus>,
              <div key="actions" className="flex min-w-max gap-1">
                <Icon label={user.status === "suspended" ? "Restore user" : "Suspend user"} onClick={() => void updateUser({ ...user, status: user.status === "suspended" ? "active" : "suspended" }, user.status === "suspended" ? "Account restored." : "Account suspended.")}><ShieldOff className="size-4" /></Icon>
                <Icon label="Reset progress" onClick={() => setConfirm({ action: "reset", user })}><RotateCcw className="size-4" /></Icon>
                <Icon label="Export user summary" onClick={() => exportUser(user)}><Download className="size-4" /></Icon>
                <Icon label={backendMode ? "Mark account deleted" : "Delete demo user"} onClick={() => setConfirm({ action: "delete", user })} danger><Trash2 className="size-4" /></Icon>
              </div>,
            ],
          }))}
        />
      ) : <AdminEmptyState title="No users found" description="Change the search or filters." />}

      <AdminConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.action === "delete" ? (backendMode ? "Mark account deleted?" : "Delete demo user?") : "Reset learner progress?"}
        description={confirm?.action === "delete" ? (backendMode ? `${confirm?.user.displayName} will be marked deleted. This does not delete the Supabase Auth identity.` : `${confirm?.user.displayName} will be removed from local admin state.`) : `${confirm?.user.displayName}'s persisted learning progress will be reset.`}
        confirmLabel={confirm?.action === "delete" ? (backendMode ? "Mark deleted" : "Delete user") : "Reset progress"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.action === "delete") deleteUser(confirm.user.id);
          else void resetProgress(confirm.user.id);
        }}
      />
    </>
  );
}

function maskEmail(email: string): string {
  return email.replace(/(^.).+(@.*$)/, "$1•••$2");
}

function Icon({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid size-9 place-items-center rounded-lg ${danger ? "text-red-600 hover:bg-red-50" : "text-slate-500 hover:bg-slate-100"}`}>{children}</button>;
}
