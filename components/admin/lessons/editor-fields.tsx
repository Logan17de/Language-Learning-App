import type { ReactNode } from "react";

export const inputClass = "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100";

export function EditorField({ label, error, children, className = "" }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>{children}{error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}</label>;
}

export function EditorPanel({ title, description, children, error }: { title: string; description: string; children: ReactNode; error?: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p>{error && <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{error}</p>}</header><div className="p-5">{children}</div></section>;
}
