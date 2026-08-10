import { ChevronDown, SearchX } from "lucide-react";

export interface FaqItem {
  category: string;
  question: string;
  answer: string;
}

export function FaqList({ items }: { items: FaqItem[] }) {
  if (!items.length) {
    return <div className="rounded-3xl border border-dashed border-border bg-surface py-12 text-center"><SearchX className="mx-auto size-8 text-moss-300" aria-hidden="true" /><p className="mt-4 font-semibold">No FAQs match that search.</p><p className="mt-2 text-sm text-muted">Try a shorter search or choose a support topic.</p></div>;
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details key={item.question} className="group rounded-2xl border border-border bg-surface p-5 open:border-moss-200">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-xl font-semibold">{item.question}<ChevronDown className="size-4 shrink-0 text-moss-600 transition group-open:rotate-180" aria-hidden="true" /></summary>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-persimmon-500">{item.category}</p>
          <p className="mt-3 text-sm leading-7 text-muted">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
