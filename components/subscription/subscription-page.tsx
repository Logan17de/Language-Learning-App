"use client";

import { useState } from "react";
import { Check, ChevronDown, Crown, Sparkles, X } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import type { BillingPeriod } from "@/types/app-preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const planFeatures = {
  free: [
    "Structured JLPT lessons",
    "Random lessons matched to your level",
    "Basic review and progress tracking",
    "Standard speaking practice",
    "Interests saved for a future upgrade",
  ],
  pro: [
    "Interest-based lesson recommendations",
    "Custom-topic AI lesson generation",
    "Unlimited adaptive lesson access",
    "Extended speaking practice",
    "Deeper progress analytics and review",
  ],
};

const comparison = [
  { feature: "Level-matched lessons", free: true, pro: true },
  { feature: "Basic review and progress", free: true, pro: true },
  { feature: "Interest-based recommendations", free: false, pro: true },
  { feature: "Custom-topic AI lessons", free: false, pro: true },
  { feature: "Extended speaking practice", free: false, pro: true },
];

export function SubscriptionPage() {
  const subscription = useAppStore((state) => state.subscription);
  const [billing, setBilling] = useState<BillingPeriod>(
    subscription.billingPeriod,
  );
  const [showCheckoutNotice, setShowCheckoutNotice] = useState(false);
  const isPro = subscription.plan === "premium";

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="text-center">
        <Badge tone={isPro ? "orange" : "neutral"}>
          <Crown className="mr-1 size-3" /> Current plan:{" "}
          {isPro ? "Pro" : "Free"}
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          Choose how personally AIko adapts.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl leading-7 text-stone-500">
          Free keeps learning structured and level-matched. Pro adds
          interest-based recommendations and custom AI-generated lessons.
        </p>
      </header>

      <div
        className="mx-auto mt-8 flex w-fit rounded-full bg-stone-100 p-1"
        role="group"
        aria-label="Billing period"
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

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <PlanCard
          name="Free"
          price="¥0"
          suffix="/ forever"
          features={planFeatures.free}
          current={!isPro}
        />
        <PlanCard
          name="Pro"
          price={billing === "annual" ? "¥20,000" : "¥2,000"}
          suffix={billing === "annual" ? "/ year" : "/ month"}
          features={planFeatures.pro}
          current={isPro}
          pro
          onChoose={() => setShowCheckoutNotice(true)}
        />
      </div>

      {!isPro && (
        <p className="mx-auto mt-5 max-w-xl text-center text-xs leading-5 text-stone-400">
          Your Free plan continues normally. Viewing Pro does not change your
          account or start a charge.
        </p>
      )}

      <Card className="mt-10 overflow-hidden p-0">
        <div className="grid grid-cols-[1fr_5rem_5rem] border-b border-stone-100 bg-moss-50 p-4 text-xs font-bold uppercase tracking-wide sm:grid-cols-[1fr_7rem_7rem]">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pro</span>
        </div>
        {comparison.map((item) => (
          <div
            key={item.feature}
            className="grid grid-cols-[1fr_5rem_5rem] items-center border-b border-stone-100 p-4 text-sm last:border-0 sm:grid-cols-[1fr_7rem_7rem]"
          >
            <span>{item.feature}</span>
            <FeatureMark included={item.free} />
            <FeatureMark included={item.pro} />
          </div>
        ))}
      </Card>

      <section className="mt-10">
        <h2 className="text-center text-2xl font-semibold">Plan questions</h2>
        <div className="mx-auto mt-5 max-w-3xl space-y-3">
          {[
            {
              question: "Will this page charge me now?",
              answer:
                "No. Checkout is not connected yet, so this page cannot charge you or change your account plan.",
            },
            {
              question: "How does Free choose lessons?",
              answer:
                "Free selects a random available lesson at your current level. Profile interests can be saved, but they do not affect Free lesson selection.",
            },
            {
              question: "When does Pro use my interests?",
              answer:
                "Pro uses interests after you add them to your learning profile. Without interests, Pro also falls back to random level-matched lessons.",
            },
          ].map(({ question, answer }) => (
            <details key={question} className="group rounded-2xl bg-white p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {question}
                <ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-stone-500">{answer}</p>
            </details>
          ))}
        </div>
      </section>

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
              silently switch your plan. The pricing and benefits shown here are
              the intended Pro offer.
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

function PlanCard({
  name,
  price,
  suffix,
  features,
  current,
  pro = false,
  onChoose,
}: {
  name: string;
  price: string;
  suffix: string;
  features: string[];
  current: boolean;
  pro?: boolean;
  onChoose?: () => void;
}) {
  return (
    <Card
      className={pro ? "border-moss-900 bg-moss-900 p-8 text-white" : "p-8"}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{name}</h2>
        {pro && (
          <Badge tone="orange">
            <Sparkles className="mr-1 size-3" /> Personal learning
          </Badge>
        )}
      </div>
      <p className="mt-7 text-4xl font-semibold">
        {price}
        <span className="text-sm font-normal opacity-50"> {suffix}</span>
      </p>
      <ul className="mt-7 space-y-3">
        {features.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-5">
            <Check
              className={`mt-0.5 size-4 shrink-0 ${pro ? "text-persimmon-400" : "text-moss-600"}`}
            />
            {item}
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant={pro ? "primary" : "secondary"}
        onClick={onChoose}
        disabled={current || !onChoose}
        className={`mt-8 w-full ${pro && !current ? "bg-persimmon-500 hover:bg-persimmon-600" : ""}`}
      >
        {current ? "Current plan" : pro ? "Get Pro" : "Free plan"}
      </Button>
    </Card>
  );
}

function FeatureMark({ included }: { included: boolean }) {
  return included ? (
    <Check className="mx-auto size-4 text-moss-600" aria-label="Included" />
  ) : (
    <X className="mx-auto size-4 text-stone-300" aria-label="Not included" />
  );
}
