import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { ThemeSync } from "@/components/layout/theme-sync";
import { SyncStatus } from "@/components/backend/sync-status";
import { BackendSessionHydrator } from "@/components/backend/backend-session-hydrator";
import { LearnerRouteGuard } from "@/components/auth/learner-route-guard";
import { AIKO_CANONICAL_ORIGIN } from "@/lib/app-url";

const japaneseSans = Noto_Sans_JP({
  variable: "--font-japanese",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(AIKO_CANONICAL_ORIGIN),
  title: {
    default: "AIko — Adaptive Language Learning",
    template: "%s · AIko",
  },
  description:
    "Adaptive language learning through connected stories, vocabulary, grammar, reading, listening, speaking, and progress-aware practice.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "AIko — Adaptive Language Learning",
    description:
      "Connected language lessons that adapt to what you understand, practise, and produce.",
    type: "website",
    url: AIKO_CANONICAL_ORIGIN,
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
