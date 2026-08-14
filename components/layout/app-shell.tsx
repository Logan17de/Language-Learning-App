import type { ReactNode } from "react";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { BottomNav } from "@/components/navigation/bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-paper/90 text-ink before:pointer-events-none before:fixed before:inset-0 before:bg-[linear-gradient(to_right,transparent_0,rgba(75,99,64,.035)_50%,transparent_100%)]">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-full bg-moss-900 px-4 py-3 text-sm font-semibold text-white shadow-float transition-transform duration-180 focus:translate-y-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-moss-200"
      >
        Skip to main content
      </a>
      <AppSidebar />
      <main
        id="main-content"
        className="relative min-h-dvh pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:ml-64 lg:pb-10"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
