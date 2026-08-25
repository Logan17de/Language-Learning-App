"use client";

import {
  Brain,
  Check,
  CircleCheckBig,
  Crown,
  MessageCircleMore,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BillingReturnNotice,
  CheckoutButton,
  ManageBillingButton,
} from "@/components/subscription/billing-actions";

const premiumFeatures = [
  {
    icon: Sparkles,
    title: "Five lessons each day",
    copy: "Create up to five AI lessons from the topics and Japanese levels you choose.",
  },
  {
    icon: Volume2,
    title: "Listening practice",
    copy: "Hear the lesson audio and complete its connected listening activities.",
  },
  {
    icon: MessageCircleMore,
    title: "Speaking practice",
    copy: "Read lesson sentences aloud with live transcription and sentence matching.",
  },
] as const;

const proFeatureNames = [
  "Five lesson creations each day",
  "Listening practice with lesson audio",
  "Speaking practice with live transcription",
];

export function SubscriptionPage() {
  const subscription = useAppStore((state) => state.subscription);
  return (
    <>
      <BillingReturnNotice />
      {subscription.plan === "premium" ? <PremiumSubscriptionPage /> : <FreeSubscriptionPage />}
    </>
  );
}

function readableBillingDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(date);
}

function PremiumSubscriptionPage() {
  const subscription = useAppStore((state) => state.subscription);
  const renewalDate = readableBillingDate(subscription.renewsAt);
  const managedByDodo = subscription.billingProvider === "dodo";

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-9">
      <header className="flex flex-col gap-5 rounded-4xl bg-moss-900 p-7 text-white sm:flex-row sm:items-end sm:justify-between sm:p-9">
        <div>
          <Badge tone="orange"><Crown className="mr-1 size-3" /> Premium account</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Your complete lesson access is active.</h1>
          <p className="mt-3 max-w-2xl leading-7 text-white/65">
            Create up to five lessons each day and use Listening and Speaking practice.
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
                <p className="mt-2 text-sm leading-6 text-stone-500">{copy}</p>
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
            <ButtonLink href="/profile" variant="secondary">View learning profile</ButtonLink>
          </div>
        </Card>
        <Card className="p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-stone-400">Plan management</p>
          <h2 className="mt-3 text-xl font-semibold capitalize">{subscription.billingPeriod} premium</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            {managedByDodo
              ? subscription.cancelAtPeriodEnd
                ? `Cancellation is scheduled${renewalDate ? ` for ${renewalDate}` : " at the end of this billing period"}. Your access remains active until then.`
                : renewalDate
                  ? `Your membership renews on ${renewalDate}. Manage payment methods, invoices, or cancellation securely.`
                  : "Manage payment methods, invoices, renewal, or cancellation securely."
              : "This Premium access was assigned by AIko and is managed by support."}
          </p>
          <div className="mt-5">
            {managedByDodo
              ? <ManageBillingButton />
              : <ButtonLink href="/support" variant="secondary" className="w-full">Contact support about this plan</ButtonLink>}
          </div>
        </Card>
      </section>
    </div>
  );
}

function FreeSubscriptionPage() {
  const subscription = useAppStore((state) => state.subscription);
  const price = "$10 USD";
  const priceSuffix = "/ month";

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-9">
      <header className="text-center">
        <Badge tone="neutral">Free account</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Unlock every lesson phase.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl leading-7 text-stone-500">
          Free includes one lesson each day plus Story, Vocabulary, Grammar, and Reading. Premium adds more daily lessons, Listening, and Speaking.
        </p>
      </header>

      <section className="mx-auto mt-7 max-w-2xl overflow-hidden rounded-3xl border border-moss-900 bg-moss-900 text-white shadow-float">
        <div className="p-7 sm:p-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-moss-200">AIko Premium</p>
              <h2 className="mt-2 text-3xl font-semibold">Complete lesson access</h2>
            </div>
            <Badge tone="orange"><Sparkles className="mr-1 size-3" /> Listening + Speaking</Badge>
          </div>
          <p className="mt-7 text-5xl font-semibold">
            {price}<span className="ml-2 text-sm font-normal text-white/50">{priceSuffix}</span>
          </p>
          <p className="mt-2 text-sm text-moss-200">One base price worldwide. Local currency and applicable tax appear at checkout.</p>
          <ul className="mt-7 grid gap-3 sm:grid-cols-2">
            {proFeatureNames.map((feature) => (
              <li key={feature} className="flex gap-3 text-sm leading-6 text-white/80">
                <Check className="mt-1 size-4 shrink-0 text-persimmon-400" />{feature}
              </li>
            ))}
          </ul>
          <CheckoutButton
            billingPeriod="monthly"
            label={`Get Premium · ${price} ${priceSuffix}`}
            className="mt-8 w-full bg-persimmon-500 hover:bg-persimmon-600"
          />
          <p className="mt-4 text-center text-xs leading-5 text-white/45">
            Secure checkout by Dodo Payments. The final localized total is shown before you pay, and Premium starts only after payment is confirmed.
          </p>
        </div>
      </section>

      {subscription.billingProvider === "dodo" ? (
        <Card className="mx-auto mt-5 max-w-2xl p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-stone-400">Billing account</p>
            <h2 className="mt-2 text-lg font-semibold">
              {subscription.status === "past_due" ? "Payment needs attention" : "Previous Premium membership"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">View invoices, payment methods, and past membership details.</p>
          </div>
          <div className="mt-4 shrink-0 sm:mt-0 sm:w-48"><ManageBillingButton /></div>
        </Card>
      ) : null}
    </div>
  );
}
