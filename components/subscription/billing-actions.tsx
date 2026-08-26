"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CircleCheckBig, LoaderCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import type { BillingPeriod, UserSubscription } from "@/types/app-preferences";

type BillingStatus = {
  plan: "free" | "premium";
  billingPeriod: BillingPeriod;
  status: UserSubscription["status"];
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  billingProvider: "manual" | "dodo";
  providerStatus: string | null;
  manageAvailable: boolean;
};

type NoticeState = "idle" | "verifying" | "confirmed" | "pending" | "cancelled";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

export function CheckoutButton({
  billingPeriod,
  label,
  className,
}: {
  billingPeriod: BillingPeriod;
  label: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openCheckout() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          billingPeriod,
          checkoutAttempt: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Checkout could not be opened."));
      const payload = (await response.json()) as { checkoutUrl?: string };
      if (!payload.checkoutUrl) throw new Error("Checkout could not be opened.");
      window.location.assign(payload.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not be opened.");
      setLoading(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        onClick={openCheckout}
        disabled={loading}
        className={className}
      >
        {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {loading ? "Opening secure checkout…" : label}
      </Button>
      {error ? <p className="mt-3 text-center text-sm text-red-200" role="alert">{error}</p> : null}
    </div>
  );
}

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response, "Billing management could not be opened."));
      const payload = (await response.json()) as { portalUrl?: string };
      if (!payload.portalUrl) throw new Error("Billing management could not be opened.");
      window.location.assign(payload.portalUrl);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Billing management could not be opened.");
      setLoading(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" onClick={openPortal} disabled={loading} className="w-full">
        {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowUpRight className="size-4" aria-hidden="true" />}
        {loading ? "Opening billing…" : "Manage billing"}
      </Button>
      {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}

export function BillingReturnNotice() {
  const setSubscription = useAppStore((state) => state.setSubscription);
  const [notice, setNotice] = useState<NoticeState>("idle");

  useEffect(() => {
    const checkoutResult = new URLSearchParams(window.location.search).get("checkout");
    if (checkoutResult === "cancelled") {
      const cancelledTimer = setTimeout(() => setNotice("cancelled"), 0);
      return () => clearTimeout(cancelledTimer);
    }
    if (checkoutResult !== "success") return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    async function syncStatus() {
      attempt += 1;
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" });
        if (response.ok) {
          const status = (await response.json()) as BillingStatus;
          if (!active) return;
          setSubscription(status.plan, status.billingPeriod, {
            status: status.status,
            renewsAt: status.renewsAt ?? undefined,
            billingProvider: status.billingProvider,
            cancelAtPeriodEnd: status.cancelAtPeriodEnd,
          });
          if (status.plan === "premium" && ["active", "trial"].includes(status.status)) {
            setNotice("confirmed");
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("checkout");
            window.history.replaceState({}, "", cleanUrl);
            return;
          }
        }
      } catch {
        // Webhook confirmation can arrive shortly after the checkout redirect.
      }
      if (!active) return;
      if (attempt < 8) timer = setTimeout(syncStatus, 1_500);
      else setNotice("pending");
    }

    const initialTimer = setTimeout(() => {
      if (!active) return;
      setNotice("verifying");
      void syncStatus();
    }, 0);
    return () => {
      active = false;
      clearTimeout(initialTimer);
      if (timer) clearTimeout(timer);
    };
  }, [setSubscription]);

  if (notice === "idle") return null;
  const verifying = notice === "verifying";
  const confirmed = notice === "confirmed";
  const title = confirmed
    ? "Premium is active"
    : notice === "cancelled"
      ? "Checkout closed"
      : notice === "pending"
        ? "Confirmation is taking longer"
        : "Confirming your membership";
  const copy = confirmed
    ? "Your full AIko learning experience is ready."
    : notice === "cancelled"
      ? "Nothing was changed. You can choose a plan whenever you are ready."
      : notice === "pending"
        ? "Your account has not been upgraded yet. Refresh this page in a moment, and do not start another checkout while confirmation is pending."
        : "Dodo Payments is securely confirming the checkout with AIko.";

  return (
    <aside className="fixed right-4 top-4 z-[130] w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-moss-100 bg-white p-5 shadow-float" aria-live="polite">
      <div className="flex gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-50 text-moss-700">
          {verifying ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : confirmed ? <CircleCheckBig className="size-5" aria-hidden="true" /> : <XCircle className="size-5" aria-hidden="true" />}
        </div>
        <div>
          <p className="font-semibold text-ink">{title}</p>
          <p className="mt-1 text-sm leading-6 text-stone-500">{copy}</p>
        </div>
      </div>
    </aside>
  );
}
