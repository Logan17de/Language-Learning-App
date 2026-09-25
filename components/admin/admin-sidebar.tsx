"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookCopy,
  BookOpenCheck,
  Bot,
  CircleDollarSign,
  FileWarning,
  Gauge,
  GraduationCap,
  Headphones,
  Image,
  Languages,
  LibraryBig,
  MessageSquareText,
  PackagePlus,
  ScrollText,
  Settings,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Dashboard", icon: Gauge },
  { href: "/admin/lessons", label: "Lessons", icon: BookOpenCheck },
  { href: "/admin/lessons/import", label: "Import lesson", icon: PackagePlus },
  { href: "/admin/lessons/batch-generate", label: "JLPT Batch Lessons", icon: Sparkles },
  { href: "/admin/generated", label: "Generated", icon: Bot },
  { href: "/admin/curriculum", label: "Curriculum", icon: GraduationCap },
  { href: "/admin/grammar", label: "Grammar", icon: Languages },
  { href: "/admin/vocabulary", label: "Kanji & Vocabulary", icon: LibraryBig },
  { href: "/admin/images", label: "Images", icon: Image },
  { href: "/admin/audio", label: "Audio", icon: Headphones },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: WalletCards },
  { href: "/admin/reports", label: "Reports", icon: FileWarning },
  { href: "/admin/support", label: "Support", icon: MessageSquareText },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/costs", label: "Costs", icon: CircleDollarSign },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export function AdminSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose, open]);

  function trapDrawerFocus(event: KeyboardEvent<HTMLElement>) {
    if (!open || event.key !== "Tab") return;
    const controls = Array.from(
      sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      {open && <button type="button" className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" aria-label="Close admin navigation" onClick={onClose} />}
      <aside ref={sidebarRef} role={open ? "dialog" : undefined} aria-modal={open ? true : undefined} aria-label="Admin navigation" onKeyDown={trapDrawerFocus} className={cn("fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 text-white transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <Link href="/admin" className="flex items-center gap-3" onClick={onClose}><span className="grid size-10 place-items-center rounded-xl bg-teal-400 text-lg font-black text-slate-950">愛</span><span><strong className="block tracking-wide">AIko Admin</strong><small className="text-white/45">Operations console</small></span></Link>
          <button ref={closeButtonRef} type="button" className="grid size-11 place-items-center rounded-lg hover:bg-white/10 lg:hidden" onClick={onClose} aria-label="Close admin menu"><X className="size-5" aria-hidden="true" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto p-4" aria-label="Admin navigation">
          <ul className="space-y-1">
            {links.map(({ href, label, icon: Icon }) => {
              const active = href === "/admin"
                ? pathname === href
                : href === "/admin/lessons"
                  ? pathname === href || (pathname?.startsWith(`${href}/`) && !pathname.startsWith("/admin/lessons/import") && !pathname.startsWith("/admin/lessons/batch-generate"))
                  : pathname?.startsWith(href);
              return <li key={href}><Link href={href} onClick={onClose} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-300", active ? "bg-teal-400 text-slate-950" : "text-white/65 hover:bg-white/10 hover:text-white")}><Icon className="size-4.5" />{label}</Link></li>;
            })}
          </ul>
        </nav>
        <div className="border-t border-white/10 p-4"><Link href="/learn" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"><BookCopy className="size-4" /> Learner app</Link></div>
      </aside>
    </>
  );
}
