import type { ReactNode } from "react";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { BottomNav } from "@/components/navigation/bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <AppSidebar />
      <main className="pb-24 lg:ml-64 lg:pb-8">{children}</main>
      <BottomNav />
    </div>
  );
}
