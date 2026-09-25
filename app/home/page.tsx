import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { HomeDashboard } from "@/components/home/home-dashboard";

export const metadata: Metadata = {
  title: "Home",
  alternates: { canonical: "/home" },
  robots: { index: false, follow: false },
};

export default function HomePage() {
  return (
    <AppShell>
      <HomeDashboard />
    </AppShell>
  );
}
