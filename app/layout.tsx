import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { ThemeSync } from "@/components/layout/theme-sync";
import { SyncStatus } from "@/components/backend/sync-status";
import { BackendSessionHydrator } from "@/components/backend/backend-session-hydrator";
import { LearnerRouteGuard } from "@/components/auth/learner-route-guard";

const japaneseSans = Noto_Sans_JP({
  variable: "--font-japanese",
  display: "swap",
  preload: false,
});

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
      <body className={japaneseSans.variable}>
        <ThemeSync />
        <BackendSessionHydrator />
        <LearnerRouteGuard>{children}</LearnerRouteGuard>
        <SyncStatus />
      </body>
    </html>
  );
}
