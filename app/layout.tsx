import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeSync } from "@/components/layout/theme-sync";
import { DemoModeBanner } from "@/components/backend/demo-mode-banner";
import { LegacyImportAssistant } from "@/components/backend/legacy-import-assistant";
import { SyncStatus } from "@/components/backend/sync-status";
import { BackendSessionHydrator } from "@/components/backend/backend-session-hydrator";

export const metadata: Metadata = {
  title: {
    default: "AIko — Japanese that adapts to you",
    template: "%s · AIko",
  },
  description: "Structured Japanese lessons that adapt to the words and grammar you find difficult.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfaf6",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><ThemeSync /><BackendSessionHydrator /><DemoModeBanner />{children}<LegacyImportAssistant /><SyncStatus /></body>
    </html>
  );
}
