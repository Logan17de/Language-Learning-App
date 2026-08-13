import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeSync } from "@/components/layout/theme-sync";
import { SyncStatus } from "@/components/backend/sync-status";
import { BackendSessionHydrator } from "@/components/backend/backend-session-hydrator";
import { LearnerRouteGuard } from "@/components/auth/learner-route-guard";

export const metadata: Metadata = {
  title: {
    default: "AIko — Adaptive Language Learning",
    template: "%s · AIko",
  },
  description:
    "Structured language learning through stories, vocabulary, grammar, reading, listening, speaking, and adaptive mastery. Launching first with Japanese.",
  openGraph: {
    title: "AIko — Adaptive Language Learning",
    description:
      "Structured language learning through connected lessons and adaptive mastery. Launching first with Japanese.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfaf6",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <ThemeSync />
        <BackendSessionHydrator />
        <LearnerRouteGuard>{children}</LearnerRouteGuard>
        <SyncStatus />
      </body>
    </html>
  );
}
