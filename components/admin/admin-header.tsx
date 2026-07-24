"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, Search } from "lucide-react";
import { AdminBreadcrumbs } from "@/components/admin/admin-breadcrumbs";
import { useAdminStore } from "@/store/admin-store";
import { authService } from "@/lib/auth/auth-service";

export function AdminHeader({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const session = useAdminStore((state) => state.session);
  const logout = useAdminStore((state) => state.logout);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value) router.push(`/admin/lessons?q=${encodeURIComponent(value)}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button type="button" className="grid size-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Open admin menu"><Menu className="size-5" /></button>
        <div className="min-w-0 flex-1"><AdminBreadcrumbs /></div>
        <form onSubmit={submit} role="search" className="hidden w-full max-w-xs md:block"><label className="relative block"><span className="sr-only">Search lessons</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" placeholder="Search content…" /></label></form>
        <button type="button" className="relative grid size-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" aria-label="3 admin notifications"><Bell className="size-5" /><span className="absolute right-2 top-2 size-2 rounded-full bg-orange-500" /></button>
        <div className="relative">
          <button type="button" onClick={() => setProfileOpen((value) => !value)} className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-left hover:bg-slate-100" aria-expanded={profileOpen}><span className="grid size-8 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white">AA</span><span className="hidden text-xs sm:block"><strong className="block text-slate-800">{session.displayName}</strong><span className="text-slate-500">{session.role}</span></span><ChevronDown className="size-3 text-slate-400" /></button>
          {profileOpen && <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><p className="px-3 py-2 text-xs text-slate-500">{session.email}</p><button type="button" onClick={async () => { await authService.signOut(); logout(); router.replace("/admin/login"); router.refresh(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="size-4" /> Log out</button></div>}
        </div>
      </div>
    </header>
  );
}
