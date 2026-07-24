"use client";

import { useMemo, useState } from "react";
import { BookOpen, CircleDollarSign, LifeBuoy, MessageCircleQuestion, Search, Shield, TriangleAlert, Wrench } from "lucide-react";
import type { SupportRequest } from "@/types/app-preferences";
import { FaqList, type FaqItem } from "@/components/support/faq-list";
import { SupportForm } from "@/components/support/support-form";
import { Card } from "@/components/ui/card";

const faqs: FaqItem[] = [
  { category: "Getting Started", question: "Where should I begin?", answer: "Complete onboarding, then use the strongest action on Home. AIko will recommend a lesson at your selected level." },
  { category: "Lessons", question: "Can I leave a lesson and return later?", answer: "Yes. Your phase, answers, reveal events, and elapsed time are saved locally." },
  { category: "Reading and Speaking", question: "Is my microphone recording real audio?", answer: "No. Reading and speaking feedback is simulated in this frontend prototype." },
  { category: "Progress", question: "Why is an item marked weak?", answer: "AIko combines repeated signals such as missed retrieval, revealed readings, and uncertain speaking. A single stop remains low confidence." },
  { category: "Subscription", question: "Will upgrading charge me?", answer: "No. Plan changes are local mock controls and no payment provider is connected." },
  { category: "Privacy", question: "Where is my learning data stored?", answer: "Prototype state is stored in your browser localStorage, with an in-memory fallback where practical." },
  { category: "Technical Issues", question: "How do I recover from a stuck lesson?", answer: "Return to the lesson preview and resume. If needed, use Settings to reset local progress after confirmation." },
];

const actions = [
  { type: "contact" as const, label: "Contact Support", icon: LifeBuoy },
  { type: "technical" as const, label: "Report Technical Issue", icon: Wrench },
  { type: "lesson" as const, label: "Report Lesson Issue", icon: BookOpen },
  { type: "billing" as const, label: "Billing Help", icon: CircleDollarSign },
];

export function SupportPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<SupportRequest["type"]>("contact");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return faqs;
    return faqs.filter((item) => `${item.category} ${item.question} ${item.answer}`.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="text-center"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-moss-100 text-moss-700"><MessageCircleQuestion className="size-7" /></span><p className="section-kicker mt-6">Support</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">How can we help?</h1><p className="mx-auto mt-3 max-w-2xl text-stone-500">Search common questions or save a frontend-only request for the future support workflow.</p></header>
      <label className="relative mx-auto mt-8 block max-w-2xl"><Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-400" /><span className="sr-only">Search help articles</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="form-input min-h-14 pl-12" placeholder="Search lessons, reading, billing, privacy…" /></label>
      <div className="mt-10 grid gap-7 lg:grid-cols-[1.15fr_.85fr]">
        <section><div className="mb-5 flex items-center gap-3"><Shield className="size-5 text-moss-600" /><h2 className="text-xl font-semibold">Frequently asked questions</h2></div><FaqList items={filtered} /></section>
        <aside>
          <Card className="sticky top-6 p-6">
            <h2 className="text-xl font-semibold">Ask for help</h2>
            <div className="mt-5 grid grid-cols-2 gap-2">{actions.map(({ type: actionType, label, icon: Icon }) => <button key={actionType} type="button" onClick={() => setType(actionType)} className={`min-h-20 rounded-2xl border p-3 text-left text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-moss-100 ${type === actionType ? "border-moss-600 bg-moss-50 text-moss-700" : "border-stone-100"}`}><Icon className="mb-2 size-4" />{label}</button>)}</div>
            <div className="mt-6"><SupportForm type={type} onTypeChange={setType} /></div>
            <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-stone-400"><TriangleAlert className="mt-0.5 size-3 shrink-0" /> No email is sent. Requests are stored only in local prototype state.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
