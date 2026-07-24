"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

export function AdminBreadcrumbs() {
  const pathname = usePathname() ?? "/admin";
  const parts = pathname.split("/").filter(Boolean).slice(1);
  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-slate-500 sm:flex">
      <Link href="/admin" className="font-semibold hover:text-teal-700">Admin</Link>
      {parts.map((part, index) => {
        const href = `/admin/${parts.slice(0, index + 1).join("/")}`;
        const label = decodeURIComponent(part).replaceAll("-", " ");
        return <span key={href} className="flex items-center gap-1"><ChevronRight className="size-3" /><Link href={href} className="max-w-40 truncate capitalize hover:text-teal-700">{label}</Link></span>;
      })}
    </nav>
  );
}
