"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { SubscriptionRecord, SubscriptionRecordStatus } from "@/types/admin";
import type { SubscriptionPlan } from "@/types/app-preferences";
import {
  AdminPageHeader,
  AdminStatCard,
  AdminStatus,
  AdminTable,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { adminOperationsRepository } from "@/lib/repositories/admin-operations-repository";
import { adminUserRepository } from "@/lib/repositories/admin-user-repository";
import type { Database, ProfileRow } from "@/types/database";

type SubscriptionRow =
  Database["public"]["Tables"]["user_subscriptions"]["Row"];
type VisibleSubscription = Omit<SubscriptionRecord, "paymentStatus">;

export function SubscriptionManagement() {
  const [backendRows, setBackendRows] = useState<SubscriptionRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [filter, setFilter] = useState<SubscriptionRecordStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [subscriptions, users] = await Promise.all([
      adminOperationsRepository.listSubscriptions(),
      adminUserRepository.list(),
    ]);
    if (!subscriptions.ok) setError(subscriptions.error.message);
    else setBackendRows(subscriptions.data);
    if (!users.ok) setError((current) => current || users.error.message);
    else setProfiles(users.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const records: VisibleSubscription[] = backendRows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: profileById.get(row.user_id)?.display_name ?? row.user_id,
    plan: row.plan === "free" ? "free" : "premium",
    billingInterval: row.billing_interval === "annual" ? "annual" : "monthly",
    status: row.status === "past_due" ? "failed" : row.status,
    startDate: row.starts_at.slice(0, 10),
    renewalDate: row.renews_at?.slice(0, 10),
    cancellationDate: row.cancelled_at?.slice(0, 10),
  }));

  async function update(
    recordId: string,
    nextStatus: SubscriptionRecordStatus,
    nextPlan?: SubscriptionPlan,
  ) {
    setError("");
    setMessage("");
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    const plan = nextPlan ?? record.plan;
    const response = await fetch(`/api/admin/subscriptions/${record.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan:
          plan === "premium"
            ? record.billingInterval === "annual"
              ? "premium_annual"
              : "premium_monthly"
            : "free",
        status: nextStatus === "failed" ? "past_due" : nextStatus,
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Subscription could not be updated.");
      return;
    }
    await load();
    setMessage("Subscription record updated.");
  }

  const visible = useMemo(
    () =>
      records.filter((record) => filter === "all" || record.status === filter),
    [filter, records],
  );
  const premium = records.filter(
    (record) => record.plan === "premium" && record.status === "active",
  ).length;
  const free = records.filter((record) => record.plan === "free").length;
  const trials = records.filter((record) => record.status === "trial").length;
  const attention = records.filter(
    (record) => record.status === "failed" || record.status === "cancelled",
  ).length;

  return (
    <>
      <AdminPageHeader
        eyebrow="Subscription operations"
        title="Subscription management"
        description="Live plan and subscription-state records from Supabase. Billing-provider revenue and payment status are not shown because no payment provider is connected."
        actions={
          <Button
            type="button"
            variant="secondary"
            className="rounded-xl"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />
      {message && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Active premium" value={premium} />
        <AdminStatCard label="Free" value={free} tone="blue" />
        <AdminStatCard label="Trials" value={trials} tone="orange" />
        <AdminStatCard
          label="Cancelled / past due"
          value={attention}
          tone={attention ? "red" : "teal"}
          detail="Subscription state only"
        />
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <select
          aria-label="Subscription status filter"
          value={filter}
          onChange={(event) =>
            setFilter(event.target.value as SubscriptionRecordStatus | "all")
          }
          className="admin-input max-w-xs"
        >
          <option value="all">All subscription statuses</option>
          <option>active</option>
          <option>cancelled</option>
          <option>trial</option>
          <option>failed</option>
        </select>
      </div>
      <div className="mt-5">
        {loading && !records.length ? (
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <AdminTable
            caption="Subscription records"
            headers={[
              "User",
              "Plan",
              "Billing",
              "Status",
              "Started",
              "Renewal",
              "Cancellation",
              "Actions",
            ]}
            rows={visible.map((record) => ({
              id: record.id,
              cells: [
                <Link
                  key="user"
                  href={`/admin/users/${record.userId}`}
                  className="font-bold text-teal-700"
                >
                  {record.userName}
                </Link>,
                <select
                  key="plan"
                  value={record.plan}
                  onChange={(event) =>
                    void update(
                      record.id,
                      "active",
                      event.target.value as SubscriptionPlan,
                    )
                  }
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                >
                  <option>free</option>
                  <option>premium</option>
                </select>,
                record.billingInterval,
                <AdminStatus key="status">{record.status}</AdminStatus>,
                record.startDate,
                record.renewalDate ?? "—",
                record.cancellationDate ?? "—",
                <div key="actions" className="flex flex-wrap gap-1">
                  <Small
                    onClick={() =>
                      void update(
                        record.id,
                        record.status === "cancelled" ? "active" : "cancelled",
                      )
                    }
                  >
                    {record.status === "cancelled" ? "Reactivate" : "Cancel"}
                  </Small>
                  <Small
                    onClick={() => void update(record.id, "trial", "premium")}
                  >
                    Mark trial
                  </Small>
                  {record.status === "failed" && (
                    <Small onClick={() => void update(record.id, "active")}>
                      <RefreshCw className="size-3" /> Mark resolved
                    </Small>
                  )}
                </div>,
              ],
            }))}
          />
        )}
      </div>
    </>
  );
}

function Small({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="min-h-9 rounded-lg px-3 text-xs"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
