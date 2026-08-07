"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, RotateCcw, ShieldOff } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { SubscriptionPlan } from "@/types/app-preferences";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import {
  adminUserRepository,
  type AdminUserDetailData,
} from "@/lib/repositories/admin-user-repository";

export function UserDetail({ userId }: { userId: string }) {
  if (getBackendMode() === "supabase") return <BackendUserDetail userId={userId} />;
  return <DemoUserDetail userId={userId} />;
}

function BackendUserDetail({ userId }: { userId: string }) {
  const [data, setData] = useState<AdminUserDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const result = await adminUserRepository.getDetail(userId);
    if (result.ok) setData(result.data);
    else setError(result.error.message);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [userId]);

  async function setAccountStatus(status: "active" | "suspended" | "deleted") {
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/users/${userId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Account status could not be updated.");
      return;
    }
    setData((current) => current ? { ...current, profile: { ...current.profile, status } } : current);
    setMessage(status === "active" ? "Account restored." : status === "suspended" ? "Account suspended." : "Account marked deleted.");
  }

  async function setPlan(plan: "free" | "premium_monthly" | "premium_annual") {
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/subscriptions/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, status: "active" }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Subscription could not be updated.");
      return;
    }
    setData((current) => current ? { ...current, profile: { ...current.profile, subscription_plan: plan } } : current);
    setMessage("Subscription updated.");
  }

  async function resetProgress() {
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/users/${userId}/reset-progress`, { method: "POST" });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Progress could not be reset.");
      return;
    }
    setMessage("Learner progress reset. Reloading live user data…");
    await load();
  }

  if (loading && !data) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading user detail" />;
  if (!data) return <AdminEmptyState title="User could not be loaded" description={error || "The account does not exist or is not visible to this administrator."} />;

  const profile = data.profile;
  const mastery = masterySummary(data);
  const totalStudy = data.activity.reduce((sum, item) => sum + item.minutes, 0);
  const lessonAverage = average(data.completions.map((item) => item.score));
  const reviewAverage = average(data.reviews.map((item) => item.score));
  const lastActive = data.activity.find((item) => item.minutes > 0)?.activity_date ?? "No recent activity";

  return (
    <>
      <AdminPageHeader
        eyebrow="Live user detail"
        title={profile.display_name}
        description={`${profile.id} · ${mask(profile.email)} · joined ${profile.created_at.slice(0, 10)}`}
        actions={<div className="flex items-center gap-2"><AdminStatus>{profile.status}</AdminStatus><Button type="button" variant="secondary" className="rounded-xl" disabled={loading} onClick={() => void load()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div>}
      />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

      <div className="mb-6 flex flex-wrap gap-2">
        <select aria-label="Change user plan" value={profile.subscription_plan} onChange={(event) => void setPlan(event.target.value as "free" | "premium_monthly" | "premium_annual")} className="admin-input w-52"><option value="free">Free</option><option value="premium_monthly">Premium monthly</option><option value="premium_annual">Premium annual</option></select>
        <Button type="button" variant="secondary" className="rounded-xl" onClick={() => void setAccountStatus(profile.status === "suspended" ? "active" : "suspended")}><ShieldOff className="size-4" />{profile.status === "suspended" ? "Restore" : "Suspend"}</Button>
        <Button type="button" variant="secondary" className="rounded-xl" onClick={() => void resetProgress()}><RotateCcw className="size-4" />Reset progress</Button>
        <Button type="button" variant="secondary" className="rounded-xl" onClick={() => exportData(data)}><Download className="size-4" />Export admin snapshot</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminSection title="Profile and preferences">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label="Email" value={profile.email} />
            <Fact label="Level" value={profile.current_jlpt_level} />
            <Fact label="Plan" value={profile.subscription_plan.replaceAll("_", " ")} />
            <Fact label="Role" value={profile.role.replaceAll("_", " ")} />
            <Fact label="Timezone" value={profile.timezone} />
            <Fact label="Daily target" value={`${profile.daily_study_minutes} min`} />
            <Fact label="Learning goal" value={data.preferences?.learning_goal || profile.learning_goal || "Not set"} />
            <Fact label="Onboarding" value={data.preferences?.onboarding_complete ? "Complete" : "Incomplete"} />
            <Fact label="Interests" value={(data.preferences?.interests ?? profile.interests).join(", ") || "None"} />
            <Fact label="Last active" value={lastActive} />
          </dl>
        </AdminSection>

        <AdminSection title="Learning overview">
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi label="XP" value={profile.xp.toLocaleString()} />
            <Kpi label="Current streak" value={`${profile.streak_days} days`} />
            <Kpi label="Longest streak" value={`${profile.longest_streak} days`} />
            <Kpi label="Lifetime study" value={`${profile.total_study_minutes} min`} />
            <Kpi label="30–90d loaded activity" value={`${totalStudy} min`} />
            <Kpi label="Lessons completed" value={data.completions.length.toLocaleString()} />
            <Kpi label="Average lesson score" value={`${lessonAverage}%`} />
            <Kpi label="Average review score" value={`${reviewAverage}%`} />
          </div>
        </AdminSection>

        <AdminSection title="Mastery evidence">
          <div className="grid gap-3 sm:grid-cols-3">
            {mastery.map((item) => <div key={item.type} className="rounded-xl bg-slate-50 p-4"><span className="text-xs font-semibold capitalize text-slate-500">{item.type}</span><strong className="mt-1 block text-2xl">{item.count}</strong><p className="mt-1 text-xs text-slate-500">{item.mastery}% mastery · {item.confidence}% confidence</p></div>)}
          </div>
          {!mastery.some((item) => item.count) && <p className="mt-4 text-sm text-slate-500">No mastery evidence has been persisted for this learner.</p>}
        </AdminSection>

        <AdminSection title="Custom lesson requests">
          {data.customRequests.length ? <div className="space-y-2">{data.customRequests.slice(0, 10).map((request) => <div key={request.id} className="rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between gap-3"><strong className="truncate">{request.topic}</strong><AdminStatus>{request.status}</AdminStatus></div><p className="mt-1 text-xs text-slate-500">{request.jlpt_level} · {new Date(request.created_at).toLocaleString()}</p></div>)}</div> : <p className="py-6 text-center text-sm text-slate-500">No custom lesson requests.</p>}
        </AdminSection>

        <AdminSection title="Recent lesson completions">
          {data.completions.length ? <div className="space-y-2">{data.completions.slice(0, 10).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3 text-sm"><div className="min-w-0"><p className="truncate font-semibold">{item.lesson_id}</p><p className="text-xs text-slate-500">{new Date(item.completed_at).toLocaleString()} · {item.duration_minutes} min</p></div><strong>{item.score}%</strong></div>)}</div> : <p className="py-6 text-center text-sm text-slate-500">No lesson completions.</p>}
        </AdminSection>

        <AdminSection title="Review history">
          {data.reviews.length ? <div className="space-y-2">{data.reviews.slice(0, 10).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="font-semibold">{item.correct_count}/{item.total_count} correct</p><p className="text-xs text-slate-500">{new Date(item.completed_at).toLocaleString()}</p></div><strong>{item.score}%</strong></div>)}</div> : <p className="py-6 text-center text-sm text-slate-500">No completed reviews.</p>}
        </AdminSection>

        <AdminSection title="Reports and support">
          <div className="grid grid-cols-2 gap-3"><Kpi label="Lesson reports" value={data.reports.length.toLocaleString()} /><Kpi label="Support tickets" value={data.tickets.length.toLocaleString()} /></div>
          <div className="mt-4 space-y-2">{[...data.reports.slice(0, 4).map((item) => ({ id: item.id, title: item.category, status: item.status, date: item.submitted_at, kind: "Report" })), ...data.tickets.slice(0, 4).map((item) => ({ id: item.id, title: item.subject, status: item.status, date: item.last_message_at, kind: "Support" }))].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 6).map((item) => <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.kind}: {item.title}</p><p className="text-xs text-slate-500">{new Date(item.date).toLocaleString()}</p></div><AdminStatus>{item.status}</AdminStatus></div>)}</div>
        </AdminSection>

        <AdminSection title="Subscription records">
          {data.subscriptions.length ? data.subscriptions.map((record) => <div key={record.id} className="mb-3 rounded-xl border border-slate-100 p-4 last:mb-0"><div className="flex flex-wrap justify-between gap-2"><strong className="capitalize">{record.plan.replaceAll("_", " ")}{record.billing_interval ? ` · ${record.billing_interval}` : ""}</strong><AdminStatus>{record.status}</AdminStatus></div><p className="mt-2 text-xs text-slate-500">Started {record.starts_at}{record.renews_at ? ` · renews ${record.renews_at}` : ""}{record.cancelled_at ? ` · cancelled ${record.cancelled_at}` : ""}</p></div>) : <p className="py-6 text-center text-sm text-slate-500">No subscription row.</p>}
        </AdminSection>

        <AdminSection title="Recent activity" description="Persisted daily study facts." className="xl:col-span-2">
          {data.activity.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.activity.slice(0, 21).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between text-sm"><strong>{item.activity_date}</strong><span>{item.minutes} min</span></div><p className="mt-1 text-xs text-slate-500">Lesson {item.lesson_minutes} · Review {item.review_minutes}</p></div>)}</div> : <p className="py-6 text-center text-sm text-slate-500">No recent activity rows.</p>}
        </AdminSection>

        <AdminSection title="Audit history" className="xl:col-span-2">
          {data.audit.length ? data.audit.map((item) => <div key={item.id} className="border-b border-slate-100 py-3 last:border-0"><div className="flex flex-wrap justify-between gap-2"><strong className="capitalize">{item.action.replaceAll("_", " ")}</strong><span className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</span></div><p className="text-sm text-slate-500">{item.entity_type} · {item.entity_id}</p></div>) : <p className="py-6 text-center text-sm text-slate-500">No admin action recorded for this user.</p>}
        </AdminSection>

        {data.settings && <AdminSection title="Raw learner settings" description="Stored settings JSON for operational diagnosis." className="xl:col-span-2"><pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-200">{JSON.stringify(data.settings.settings, null, 2)}</pre></AdminSection>}
      </div>
    </>
  );
}

function masterySummary(data: AdminUserDetailData) {
  return ["kanji", "vocabulary", "grammar"].map((type) => {
    const rows = data.mastery.filter((item) => item.item_type === type);
    return {
      type,
      count: rows.length,
      mastery: average(rows.map((item) => item.mastery)),
      confidence: average(rows.map((item) => item.confidence)),
    };
  });
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 break-words font-semibold capitalize">{value}</dd></div>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><strong className="text-2xl">{value}</strong><span className="mt-1 block text-xs text-slate-500">{label}</span></div>;
}

function mask(email: string) {
  return email.replace(/(^.).+(@.*$)/, "$1•••$2");
}

function exportData(data: AdminUserDetailData) {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${data.profile.id}-admin-snapshot.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function DemoUserDetail({ userId }: { userId: string }) {
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
  if (!user) return <AdminEmptyState title="User not found" description="The demo user ID is invalid or no longer available." />;
  const isPrimary = user.id === learner.id;

  return (
    <>
      <AdminPageHeader eyebrow="Demo user detail" title={user.displayName} description={`${user.id} · ${mask(user.email)} · local deterministic data.`} actions={<AdminStatus>{user.status}</AdminStatus>} />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      <div className="mb-6 flex flex-wrap gap-2"><select aria-label="Change user plan" value={user.subscription} onChange={(event) => { changePlan(user.id, event.target.value as SubscriptionPlan); setMessage("Demo plan changed."); }} className="admin-input w-44"><option>free</option><option>premium</option></select><Button type="button" variant="secondary" className="rounded-xl" onClick={() => { updateUser({ ...user, status: user.status === "suspended" ? "active" : "suspended" }, user.status === "suspended" ? "user restored" : "user suspended"); setMessage("Demo account status updated."); }}><ShieldOff className="size-4" /> {user.status === "suspended" ? "Restore" : "Suspend"}</Button><Button type="button" variant="secondary" className="rounded-xl" onClick={() => { resetProgress(user.id); setMessage("Demo learner progress reset."); }}><RotateCcw className="size-4" /> Reset progress</Button></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <AdminSection title="Profile and preferences"><dl className="grid gap-4 sm:grid-cols-2">{[["Level", user.level], ["Plan", user.subscription], ["Joined", user.joinDate], ["Last active", user.lastActive], ["Streak", `${user.streak} days`], ["XP", user.xp.toLocaleString()], ["Lesson length", isPrimary ? `${settings.lessonLength} min` : "30 min"], ["Focus", isPrimary ? settings.preferredFocus : "balanced"]].map(([label, value]) => <Fact key={label} label={label} value={value} />)}</dl></AdminSection>
        <AdminSection title="Learner mastery"><div className="grid gap-3 sm:grid-cols-2">{[["Kanji recognition", isPrimary ? progress.kanjiRecognition : 72], ["Pronunciation", isPrimary ? progress.pronunciation : 68], ["Grammar understanding", isPrimary ? progress.grammarUnderstanding : 74], ["Grammar production", isPrimary ? progress.grammarProduction : 61]].map(([label, value]) => <Kpi key={label} label={label as string} value={`${value}%`} />)}</div></AdminSection>
        <AdminSection title="Lesson and review history"><p className="text-sm text-slate-600">{user.lessonsCompleted} lessons completed · {isPrimary ? reviewHistory.length : 9} review sessions</p></AdminSection>
        <AdminSection title="Generated lessons"><Kpi label="Custom lessons linked to learner" value={(isPrimary ? generated.length : 2).toString()} /></AdminSection>
        <AdminSection title="Subscription history">{subscriptions.map((record) => <div key={record.id} className="mb-3 rounded-xl border border-slate-100 p-4"><div className="flex justify-between"><strong className="capitalize">{record.plan} · {record.billingInterval}</strong><AdminStatus>{record.status}</AdminStatus></div><p className="mt-2 text-xs text-slate-500">{record.startDate} {record.renewalDate ? `→ ${record.renewalDate}` : ""}</p></div>)}</AdminSection>
        <AdminSection title="Reports and support"><div className="grid grid-cols-2 gap-3"><Kpi label="Lesson reports" value={(isPrimary ? reports.length : user.reportCount).toString()} /><Kpi label="Support requests" value={(isPrimary ? support.length : user.supportRequestCount).toString()} /></div></AdminSection>
        <AdminSection title="Audit history" className="xl:col-span-2">{audit.length ? audit.map((item) => <div key={item.id} className="border-b border-slate-100 py-3 last:border-0"><strong className="capitalize">{item.action}</strong><p className="text-sm text-slate-500">{item.summary}</p></div>) : <p className="py-6 text-center text-sm text-slate-500">No demo admin action recorded for this user.</p>}</AdminSection>
      </div>
    </>
  );
}
