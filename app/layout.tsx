import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeSync } from "@/components/layout/theme-sync";
import { DemoModeBanner } from "@/components/backend/demo-mode-banner";
import { SyncStatus } from "@/components/backend/sync-status";
import { BackendSessionHydrator } from "@/components/backend/backend-session-hydrator";
import { LearnerRouteGuard } from "@/components/auth/learner-route-guard";

export const metadata: Metadata = {
  metadataBase: new URL("https://aiko.zetbros.com"),
  title: {
    default: "AIko — Phone App Coming Soon",
    template: "%s · AIko",
  },
  description:
    "The AIko phone app is coming soon. Learn through connected, adaptive language lessons. The web app will not be available.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "AIko — Phone App Coming Soon",
    description:
      "The AIko phone app is coming soon. The web app will not be available.",
    type: "website",
    url: "https://aiko.zetbros.com",
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
        <DemoModeBanner />
        <LearnerRouteGuard>{children}</LearnerRouteGuard>
        <SyncStatus />
      </body>
    </html>
  );
}
