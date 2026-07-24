import Link from "next/link";
import { Sprout } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="AIko home">
      <span className="grid size-10 place-items-center rounded-2xl bg-moss-600 text-white shadow-lg shadow-moss-600/20">
        <Sprout className="size-5" />
      </span>
      {!compact && (
        <span className="text-xl font-bold tracking-tight text-ink">
          AIko <span className="font-serif text-persimmon-500">愛子</span>
        </span>
      )}
    </Link>
  );
}
