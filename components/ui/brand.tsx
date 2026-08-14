import Link from "next/link";
import { Compass } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex min-h-12 items-center gap-2.5 rounded-2xl outline-none transition duration-180 focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      aria-label="AIko home"
    >
      <span className="grid size-11 shrink-0 rotate-3 place-items-center rounded-xl border border-persimmon-300/50 bg-moss-900 text-persimmon-300 shadow-soft">
        <Compass className="size-5 -rotate-3" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="font-serif text-2xl font-bold tracking-tight text-ink">
          AIko <span className="font-sans text-xs font-semibold uppercase tracking-[.22em] text-persimmon-600">愛子</span>
        </span>
      )}
    </Link>
  );
}
