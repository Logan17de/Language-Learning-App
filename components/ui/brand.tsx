import Link from "next/link";
import { Sprout } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex min-h-12 items-center gap-2.5 rounded-2xl outline-none transition duration-180 focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      aria-label="AIko home"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-moss-600 text-white shadow-soft">
        <Sprout className="size-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="text-xl font-bold tracking-tight text-ink">
          AIko <span className="font-serif font-normal text-persimmon-500">愛子</span>
        </span>
      )}
    </Link>
  );
}
