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
        <div className="absolute inset-0 bg-[url('/images/aiko-world-map.png')] bg-cover bg-center opacity-55" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-t from-moss-900 via-moss-900/55 to-moss-900/30" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-14 text-white">
          <p className="font-serif text-7xl text-white/10">学</p>
          <div>
            <p className="max-w-xl font-serif text-5xl font-semibold leading-tight">Begin a Japanese journey that remembers every trail you found difficult.</p>
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
