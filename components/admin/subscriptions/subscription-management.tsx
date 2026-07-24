"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import type { SubscriptionRecordStatus } from "@/types/admin";
import type { SubscriptionPlan } from "@/types/app-preferences";
import { AdminPageHeader, AdminStatCard, AdminStatus, AdminTable } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

export function SubscriptionManagement() {
  const records = useAdminStore((state) => state.subscriptions);
  const update = useAdminStore((state) => state.updateSubscription);
  const [filter, setFilter] = useState<SubscriptionRecordStatus | "all">("all");
  const visible = useMemo(() => records.filter((record) => filter === "all" || record.status === filter), [filter, records]);
  const premium = records.filter((record) => record.plan === "premium" && record.status === "active").length;
  const free = records.filter((record) => record.plan === "free").length;
  const monthly = records.filter((record) => record.plan === "premium" && record.status === "active").reduce((sum, record) => sum + (record.billingInterval === "annual" ? 7.99 : 9.99), 0);
  return (
    <>
      <AdminPageHeader eyebrow="Revenue operations" title="Subscription management" description="Frontend-only plan, trial, cancellation, and failed-payment simulation. No Stripe or payment provider is connected." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminStatCard label="Active premium" value={premium} /><AdminStatCard label="Free users" value={free} tone="blue" /><AdminStatCard label="MRR estimate" value={`$${monthly.toFixed(2)}`} tone="orange" /><AdminStatCard label="ARR estimate" value={`$${(monthly * 12).toFixed(2)}`} detail="7.8% conversion · 2.4% churn estimate" /></div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"><select aria-label="Subscription status filter" value={filter} onChange={(event) => setFilter(event.target.value as SubscriptionRecordStatus | "all")} className="admin-input max-w-xs"><option value="all">All subscription statuses</option><option>active</option><option>cancelled</option><option>trial</option><option>failed</option></select></div>
      <div className="mt-5"><AdminTable caption="Subscription records" headers={["User", "Plan", "Billing", "Status", "Started", "Renewal", "Cancellation", "Payment", "Actions"]} rows={visible.map((record) => ({ id: record.id, cells: [record.userName, <select key="plan" value={record.plan} onChange={(event) => update(record.id, "active", event.target.value as SubscriptionPlan)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs"><option>free</option><option>premium</option></select>, record.billingInterval, <AdminStatus key="status">{record.status}</AdminStatus>, record.startDate, record.renewalDate ?? "—", record.cancellationDate ?? "—", <AdminStatus key="pay">{record.paymentStatus}</AdminStatus>, <div key="actions" className="flex flex-wrap gap-1"><Small onClick={() => update(record.id, record.status === "cancelled" ? "active" : "cancelled")}>{record.status === "cancelled" ? "Reactivate" : "Cancel"}</Small><Small onClick={() => update(record.id, "trial", "premium")}>Extend trial</Small>{record.status === "failed" && <Small onClick={() => update(record.id, "active")}><RefreshCw className="size-3" /> Resolve payment</Small>}</div>] }))} /></div>
    </>
  );
}
function Small({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <Button type="button" variant="secondary" className="min-h-9 rounded-lg px-3 text-xs" onClick={onClick}>{children}</Button>; }
