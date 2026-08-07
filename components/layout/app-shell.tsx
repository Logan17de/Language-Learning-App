import type { ReactNode } from "react";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { BottomNav } from "@/components/navigation/bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
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
