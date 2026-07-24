import { ChevronDown, SearchX } from "lucide-react";

export interface FaqItem {
  category: string;
  question: string;
  answer: string;
}

export function FaqList({ items }: { items: FaqItem[] }) {
  if (!items.length) {
    return <div className="rounded-3xl bg-white py-12 text-center"><SearchX className="mx-auto size-8 text-moss-300" /><p className="mt-4 font-semibold">No FAQs match that search.</p></div>;
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details key={item.question} className="group rounded-2xl border border-black/[.06] bg-white p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{item.question}<ChevronDown className="size-4 shrink-0 text-moss-600 transition group-open:rotate-180" /></summary>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-persimmon-500">{item.category}</p>
          <p className="mt-3 text-sm leading-7 text-stone-500">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
