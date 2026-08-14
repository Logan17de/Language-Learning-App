import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-aiko-sans" });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-aiko-display",
  weight: ["500", "600", "700"],
});
import { ThemeSync } from "@/components/layout/theme-sync";
import { DemoModeBanner } from "@/components/backend/demo-mode-banner";
import { SyncStatus } from "@/components/backend/sync-status";
import { BackendSessionHydrator } from "@/components/backend/backend-session-hydrator";
import { LearnerRouteGuard } from "@/components/auth/learner-route-guard";

export const metadata: Metadata = {
  title: {
    default: "AIko — Adaptive Language Learning",
    template: "%s · AIko",
  },
  description:
    "Structured language learning through stories, vocabulary, grammar, reading, listening, speaking, and personalised review. Launching first with Japanese.",
  openGraph: {
    title: "AIko — Adaptive Language Learning",
    description:
      "Structured language learning through connected lessons and personalised review. Launching first with Japanese.",
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
    <html lang="en" className="bg-paper" data-scroll-behavior="smooth">
      <body className={`${geist.variable} ${cormorant.variable} font-sans`}>
        <ThemeSync />
        <BackendSessionHydrator />
        <DemoModeBanner />
        <LearnerRouteGuard>{children}</LearnerRouteGuard>
        <SyncStatus />
      </body>
    </html>
  );
}
