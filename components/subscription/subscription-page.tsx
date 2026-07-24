"use client";

import { useState } from "react";
import { Check, Crown, Sparkles } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import type { BillingPeriod } from "@/types/app-preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const proFeatures = [
  "Interest-based lesson recommendations",
  "Custom-topic AI lesson generation",
  "Unlimited adaptive lesson access",
  "Extended speaking practice",
  "Deeper progress analytics and review",
];

export function SubscriptionPage() {
  const subscription = useAppStore((state) => state.subscription);
  const [billing, setBilling] = useState<BillingPeriod>(
    subscription.billingPeriod,
  );
  const [showCheckoutNotice, setShowCheckoutNotice] = useState(false);
  const isPro = subscription.plan === "premium";
  const price = billing === "annual" ? "¥20,000" : "¥2,000";
  const priceSuffix = billing === "annual" ? "/ year" : "/ month";

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="text-center">
        <Badge tone="orange">
          <Crown className="mr-1 size-3" />{" "}
          {isPro ? "Your Pro plan" : "AIko Pro"}
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          Learning shaped around your interests.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl leading-7 text-stone-500">
          Pro adds interest-based recommendations, custom AI-generated lessons,
          and deeper practice tools to your Japanese learning path.
        </p>
      </header>

      <div
        className="mx-auto mt-8 flex w-fit rounded-full bg-stone-100 p-1"
        role="group"
        aria-label="Pro billing period"
      >
        {(["monthly", "annual"] as BillingPeriod[]).map((period) => (
          <button
            key={period}
            type="button"
            onClick={() => setBilling(period)}
            className={cn(
              "min-h-11 rounded-full px-5 text-sm font-semibold capitalize sm:px-6",
              billing === period
                ? "bg-white text-moss-700 shadow-sm"
                : "text-stone-500",
            )}
          >
            {period}
            {period === "annual" && (
              <span className="ml-2 text-[10px] text-persimmon-600">
                save ¥4,000
              </span>
            )}
          </button>
        ))}
      </div>

      <Card className="mx-auto mt-10 max-w-2xl overflow-hidden border-moss-900 bg-moss-900 p-0 text-white shadow-float">
        <div className="p-7 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-moss-200">
                AIko Pro
              </p>
              <h2 className="mt-2 text-3xl font-semibold">Personal learning</h2>
            </div>
            <Badge tone="orange">
              <Sparkles className="mr-1 size-3" /> Full experience
            </Badge>
          </div>

          <p className="mt-8 text-5xl font-semibold">
            {price}
            <span className="ml-2 text-sm font-normal text-white/50">
              {priceSuffix}
            </span>
          </p>
          {billing === "annual" && (
            <p className="mt-2 text-sm text-moss-200">
              Equivalent to about ¥1,667 per month.
            </p>
          )}

          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {proFeatures.map((feature) => (
              <li
                key={feature}
                className="flex gap-3 text-sm leading-6 text-white/80"
              >
                <Check className="mt-1 size-4 shrink-0 text-persimmon-400" />
                {feature}
              </li>
            ))}
          </ul>

          <Button
            type="button"
            onClick={() => setShowCheckoutNotice(true)}
            disabled={isPro}
            className="mt-9 w-full bg-persimmon-500 hover:bg-persimmon-600"
          >
            {isPro ? "Current Pro plan" : `Get Pro · ${price} ${priceSuffix}`}
          </Button>
          {!isPro && (
            <p className="mt-4 text-center text-xs leading-5 text-white/45">
              Checkout is not connected yet. You will not be charged from this
              page.
            </p>
          )}
        </div>
      </Card>

      {showCheckoutNotice && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-notice"
        >
          <div className="w-full max-w-md rounded-4xl bg-white p-7 shadow-float">
            <Sparkles className="size-8 text-persimmon-500" />
            <h2 id="checkout-notice" className="mt-5 text-2xl font-semibold">
              Pro checkout is coming soon.
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Payment is not connected yet, so AIko will not charge you or
              silently switch your plan. The pricing shown here is the intended
              Pro offer.
            </p>
            <Button
              className="mt-6 w-full"
              onClick={() => setShowCheckoutNotice(false)}
            >
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
