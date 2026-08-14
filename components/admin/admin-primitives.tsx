"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Inbox, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AdminStatCard({
  label,
  value,
  detail,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "teal" | "orange" | "red" | "blue";
}) {
  const tones = {
    teal: "bg-teal-50 text-teal-700",
    orange: "bg-orange-50 text-orange-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-700",
  };
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className={cn("mb-4 h-1.5 w-10 rounded-full", tones[tone])} />
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {detail && <p className="mt-2 text-xs text-slate-500">{detail}</p>}
    </article>
  );
}

export function AdminSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface shadow-sm", className)}>
      <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function AdminStatus({ children }: { children: ReactNode }) {
  const value = String(children).toLowerCase();
  const style = value.includes("fail") || value.includes("reject") || value.includes("urgent") || value.includes("inappropriate")
    ? "bg-red-50 text-red-700 ring-red-100"
    : value.includes("publish") || value.includes("active") || value.includes("pass") || value.includes("fixed") || value.includes("resolved") || value.includes("operational")
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : value.includes("warn") || value.includes("review") || value.includes("waiting") || value.includes("degraded") || value.includes("trial")
        ? "bg-amber-50 text-amber-700 ring-amber-100"
        : "bg-slate-100 text-slate-700 ring-slate-200";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1 ring-inset", style)}>{children}</span>;
}

export function AdminTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: Array<{ id: string; cells: ReactNode[] }>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>{headers.map((header) => <th key={header} scope="col" className="whitespace-nowrap px-4 py-3 font-bold">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row) => <tr key={row.id} className="hover:bg-slate-50">{row.cells.map((cell, index) => <td key={`${row.id}_${index}`} className="px-4 py-3 align-top text-slate-700">{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function AdminEmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center"><Inbox className="mx-auto size-9 text-slate-300" /><h2 className="mt-4 font-bold text-slate-900">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p></div>;
}

export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/65 p-5" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><AlertTriangle className="size-5" /></span>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close confirmation"><X className="size-5" /></button>
        </div>
        <h2 id="admin-confirm-title" className="mt-5 text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-6 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" className="bg-red-600 hover:bg-red-700" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button></div>
      </div>
    </div>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-teal-700">{eyebrow}</p><h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p></div>
      {actions}
    </header>
  );
}
