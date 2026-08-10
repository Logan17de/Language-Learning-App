"use client";

import { useState } from "react";
import {
  Brain,
  Check,
  CircleCheckBig,
  Crown,
  MessageCircleMore,
  Route,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import type { BillingPeriod } from "@/types/app-preferences";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const premiumFeatures = [
  {
    icon: Route,
    title: "Interest-based recommendations",
    copy: "Your interests rank suitable lessons while completed and assigned lessons stay out of rotation.",
  },
  {
    icon: Sparkles,
    title: "Custom-topic AI lessons",
    copy: "Generate a complete lesson package from your topic, level, weak grammar, and unseen kanji.",
  },
  {
    icon: MessageCircleMore,
    title: "Extended speaking practice",
    copy: "Use guided-to-open speaking tasks with meaning-based answer evaluation.",
  },
  {
    icon: TrendingUp,
    title: "Complete learning insights",
    copy: "See deeper mastery, confidence, review priority, strengths, and weaknesses.",
  },
] as const;

const proFeatureNames = [
  "Interest-based lesson recommendations",
  "Custom-topic AI lesson generation",
  "Unlimited adaptive lesson access",
  "Extended speaking practice",
  "Deeper progress analytics and review",
];

export function SubscriptionPage() {
  const subscription = useAppStore((state) => state.subscription);
  return subscription.plan === "premium"
    ? <PremiumSubscriptionPage />
    : <FreeSubscriptionPage />;
}

function PremiumSubscriptionPage() {
  const subscription = useAppStore((state) => state.subscription);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-9">
      <header className="flex flex-col gap-5 rounded-4xl bg-moss-900 p-7 text-white sm:flex-row sm:items-end sm:justify-between sm:p-9">
        <div>
          <Badge tone="orange"><Crown className="mr-1 size-3" /> Premium account</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Your full AIko experience is active.</h1>
          <p className="mt-3 max-w-2xl leading-7 text-white/65">
            Custom generation, interest-shaped recommendations, extended speaking, and complete learning insights are unlocked.
          </p>
        </div>
        <div className="shrink-0 rounded-3xl border border-white/10 bg-white/8 px-6 py-5">
          <p className="text-xs uppercase tracking-[.18em] text-white/45">Current account</p>
          <p className="mt-2 flex items-center gap-2 text-xl font-semibold">
            <CircleCheckBig className="size-5 text-persimmon-400" /> Premium
          </p>
          <p className="mt-1 text-sm capitalize text-white/55">{subscription.billingPeriod} access</p>
        </div>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Unlocked premium capabilities">
        {premiumFeatures.map(({ icon: Icon, title, copy }) => (
          <Card key={title} className="p-6">
            <div className="flex gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-600">
                <Icon className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{copy}</p>
              </div>
            </div>
          </Card>
        ))}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="p-6 sm:p-7">
          <Badge tone="moss"><Brain className="mr-1 size-3" /> Premium controls</Badge>
          <h2 className="mt-3 text-2xl font-semibold">Use everything that is included.</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ButtonLink href="/custom-topic" className="bg-persimmon-500 hover:bg-persimmon-600">
              Create an AI lesson
            </ButtonLink>
            <ButtonLink href="/progress" variant="secondary">View complete insights</ButtonLink>
            <ButtonLink href="/learn" variant="secondary">Continue my lesson</ButtonLink>
            <ButtonLink href="/profile" variant="secondary">Update interests</ButtonLink>
          </div>
        </Card>
        <Card className="p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted">Plan management</p>
          <h2 className="mt-3 text-xl font-semibold capitalize">{subscription.billingPeriod} premium</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Billing checkout is not connected yet, so this account will not be automatically charged, renewed, or downgraded here.
          </p>
          <ButtonLink href="/support" variant="ghost" className="mt-4 px-0 text-moss-700">
            Contact support about this plan
          </ButtonLink>
        </Card>
      </section>
    </div>
  );
}

function FreeSubscriptionPage() {
  const subscription = useAppStore((state) => state.subscription);
  const [billing, setBilling] = useState<BillingPeriod>(subscription.billingPeriod);
  const [showCheckoutNotice, setShowCheckoutNotice] = useState(false);
  const price = billing === "annual" ? "¥20,000" : "¥2,000";
  const priceSuffix = billing === "annual" ? "/ year" : "/ month";

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-9">
      <header className="text-center">
        <Badge tone="neutral">Free account</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Unlock the complete AIko system.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl leading-7 text-muted">
          Your free account keeps the core learning path. Premium adds personal lesson selection, AI-generated topics, extended speaking, and deeper insights.
        </p>
      </header>

      <div className="mx-auto mt-7 flex w-fit rounded-full bg-surface-muted p-1" role="group" aria-label="Premium billing period">
        {(["monthly", "annual"] as BillingPeriod[]).map((period) => (
          <button
            key={period}
            type="button"
            onClick={() => setBilling(period)}
            aria-pressed={billing === period}
            className={cn(
              "min-h-11 rounded-full px-5 text-sm font-semibold capitalize sm:px-6",
              billing === period ? "bg-surface text-moss-700 shadow-sm" : "text-muted",
            )}
          >
            {period}
            {period === "annual" && <span className="ml-2 text-[10px] text-persimmon-600">save ¥4,000</span>}
          </button>
        ))}
      </div>

      <section className="mx-auto mt-7 max-w-2xl overflow-hidden rounded-3xl border border-moss-900 bg-moss-900 text-white shadow-float">
        <div className="p-7 sm:p-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-moss-200">AIko Premium</p>
              <h2 className="mt-2 text-3xl font-semibold">Everything unlocked</h2>
            </div>
            <Badge tone="orange"><Sparkles className="mr-1 size-3" /> Full experience</Badge>
          </div>
          <p className="mt-7 text-5xl font-semibold">
            {price}<span className="ml-2 text-sm font-normal text-white/50">{priceSuffix}</span>
          </p>
          {billing === "annual" && <p className="mt-2 text-sm text-moss-200">Equivalent to about ¥1,667 per month.</p>}
          <ul className="mt-7 grid gap-3 sm:grid-cols-2">
            {proFeatureNames.map((feature) => (
              <li key={feature} className="flex gap-3 text-sm leading-6 text-white/80">
                <Check className="mt-1 size-4 shrink-0 text-persimmon-400" />{feature}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            onClick={() => setShowCheckoutNotice(true)}
            className="mt-8 w-full bg-persimmon-500 hover:bg-persimmon-600"
          >
            Get Premium · {price} {priceSuffix}
          </Button>
          <p className="mt-4 text-center text-xs leading-5 text-white/45">
            Checkout is not connected yet. You will not be charged from this page.
          </p>
        </div>
      </section>

      <Dialog
        open={showCheckoutNotice}
        onClose={() => setShowCheckoutNotice(false)}
        labelledBy="checkout-notice"
        describedBy="checkout-description"
        panelClassName="max-w-md"
      >
            <Sparkles className="size-8 text-persimmon-500" aria-hidden="true" />
            <h2 id="checkout-notice" className="mt-5 text-2xl font-semibold">Premium checkout is coming soon.</h2>
            <p id="checkout-description" className="mt-3 text-sm leading-6 text-muted">
              Payment is not connected, so AIko will not charge you or silently change this account. An administrator can assign beta premium access.
            </p>
            <Button className="mt-6 w-full" data-dialog-autofocus onClick={() => setShowCheckoutNotice(false)}>Got it</Button>
      </Dialog>
    </div>
  );
}
