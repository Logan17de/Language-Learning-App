import type { ReactNode } from "react";
import { Brand } from "@/components/ui/brand";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1fr_1.05fr]">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Brand />
          {children}
        </div>
      </section>
      <aside className="relative hidden overflow-hidden bg-moss-900 lg:block">
        <div className="absolute -right-24 -top-24 size-96 rounded-full border-[5rem] border-persimmon-400/10" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-24 size-[28rem] rounded-full border-[6rem] border-moss-500/15" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-14 text-white">
          <p className="font-serif text-7xl text-white/10" aria-hidden="true">学</p>
          <div>
            <p className="max-w-xl text-4xl font-semibold leading-tight">Japanese that stays with you—because every lesson responds to what you find difficult.</p>
            <div className="mt-10 flex gap-3">
              {["Context first", "Active recall", "Personal review"].map((item) => (
                <span key={item} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold">{item}</span>
              ))}
            </div>
          </div>
          <p className="text-sm text-white/45">Structured learning. Human pace.</p>
        </div>
      </aside>
    </main>
  );
}
