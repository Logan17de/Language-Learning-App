"use client";

import { useState } from "react";
import { Check, ChevronDown, Crown, ShieldCheck, Sparkles, X } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import type { BillingPeriod, SubscriptionPlan } from "@/types/app-preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const plans = {
  free: ["Curated JLPT lessons", "Limited daily lessons", "Basic progress tracking", "Limited speaking practice", "Basic review"],
  premium: ["Custom-topic lessons", "Unlimited adaptive lessons", "Extended speaking practice", "Deeper progress analytics", "Advanced review", "Future AIko tutor characters", "Priority custom lesson creation"],
};

export function SubscriptionPage() {
  const subscription = useAppStore((state) => state.subscription);
  const setSubscription = useAppStore((state) => state.setSubscription);
  const cancel = useAppStore((state) => state.cancelSubscription);
  const [billing, setBilling] = useState<BillingPeriod>(subscription.billingPeriod);
  const [confirm, setConfirm] = useState<"downgrade" | "cancel" | null>(null);

  function choose(plan: SubscriptionPlan) {
    if (plan === "free" && subscription.plan === "premium") {
      setConfirm("downgrade");
      return;
    }
    setSubscription(plan, billing);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="text-center"><Badge tone="orange"><Crown className="mr-1 size-3" /> Current plan: {subscription.plan}</Badge><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Choose how deeply AIko adapts.</h1><p className="mx-auto mt-4 max-w-2xl text-stone-500">Mock billing only—switch plans freely for local development and feature testing.</p></header>
      <div className="mx-auto mt-8 flex w-fit rounded-full bg-stone-100 p-1" role="group" aria-label="Billing period">
        {(["monthly", "annual"] as BillingPeriod[]).map((period) => <button key={period} type="button" onClick={() => setBilling(period)} className={cn("min-h-11 rounded-full px-6 text-sm font-semibold capitalize", billing === period ? "bg-white text-moss-700 shadow-sm" : "text-stone-500")}>{period}{period === "annual" && <span className="ml-2 text-[10px] text-persimmon-600">save 20%</span>}</button>)}
      </div>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <PlanCard name="Free" price="¥0" features={plans.free} current={subscription.plan === "free"} onChoose={() => choose("free")} />
        <PlanCard name="Premium" price={billing === "annual" ? "¥1,184" : "¥1,480"} suffix="/ month" features={plans.premium} current={subscription.plan === "premium"} premium onChoose={() => choose("premium")} />
      </div>
      {subscription.plan === "premium" && <div className="mt-5 text-center"><Button type="button" variant="ghost" onClick={() => setConfirm("cancel")} className="text-stone-400">Cancel mock subscription</Button></div>}

      <Card className="mt-10 overflow-hidden p-0">
        <div className="grid grid-cols-[1fr_6rem_6rem] border-b border-stone-100 bg-moss-50 p-4 text-xs font-bold uppercase tracking-wide"><span>Feature</span><span className="text-center">Free</span><span className="text-center">Premium</span></div>
        {["Structured lessons", "Basic review", "Custom topics", "Advanced analytics", "Extended speaking"].map((feature, index) => <div key={feature} className="grid grid-cols-[1fr_6rem_6rem] items-center border-b border-stone-100 p-4 text-sm last:border-0"><span>{feature}</span><span className="text-center">{index < 2 ? <Check className="mx-auto size-4 text-moss-600" /> : <X className="mx-auto size-4 text-stone-300" />}</span><Check className="mx-auto size-4 text-moss-600" /></div>)}
      </Card>

      <section className="mt-10"><h2 className="text-center text-2xl font-semibold">Billing questions</h2><div className="mx-auto mt-5 max-w-3xl space-y-3">{["Is this a real payment?", "Can I switch plans?", "What happens to custom lessons after downgrade?"].map((question, index) => <details key={question} className="group rounded-2xl bg-white p-5"><summary className="flex cursor-pointer list-none items-center justify-between font-semibold">{question}<ChevronDown className="size-4 group-open:rotate-180" /></summary><p className="mt-3 text-sm leading-6 text-stone-500">{index === 0 ? "No. Every billing action is local UI simulation." : index === 1 ? "Yes. Use the plan buttons as an obvious local demo control." : "Generated lessons remain in your local library, but creating new ones is gated."}</p></details>)}</div></section>

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5" role="dialog" aria-modal="true" aria-labelledby="subscription-confirm">
          <div className="w-full max-w-md rounded-4xl bg-white p-7 shadow-float"><ShieldCheck className="size-8 text-persimmon-500" /><h2 id="subscription-confirm" className="mt-5 text-2xl font-semibold">{confirm === "cancel" ? "Cancel Premium?" : "Switch to Free?"}</h2><p className="mt-3 text-sm leading-6 text-stone-500">Custom lesson creation will lock, while existing generated lessons stay in your library.</p><div className="mt-6 flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>Keep Premium</Button><Button className="flex-1 bg-persimmon-500 hover:bg-persimmon-600" onClick={() => { cancel(); setConfirm(null); }}>Confirm</Button></div></div>
        </div>
      )}
    </div>
  );
}

function PlanCard({ name, price, suffix, features, current, premium = false, onChoose }: { name: string; price: string; suffix?: string; features: string[]; current: boolean; premium?: boolean; onChoose: () => void }) {
  return <Card className={premium ? "border-moss-900 bg-moss-900 p-8 text-white" : "p-8"}><div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">{name}</h2>{premium && <Badge tone="orange"><Sparkles className="mr-1 size-3" /> Most flexible</Badge>}</div><p className="mt-7 text-4xl font-semibold">{price}<span className="text-sm font-normal opacity-50"> {suffix}</span></p><ul className="mt-7 space-y-3">{features.map((item) => <li key={item} className="flex gap-3 text-sm"><Check className={`size-4 shrink-0 ${premium ? "text-persimmon-400" : "text-moss-600"}`} />{item}</li>)}</ul><Button type="button" variant={premium ? "primary" : "secondary"} onClick={onChoose} disabled={current} className={`mt-8 w-full ${premium ? "bg-persimmon-500 hover:bg-persimmon-600" : ""}`}>{current ? "Current plan" : `Choose ${name}`}</Button></Card>;
}
