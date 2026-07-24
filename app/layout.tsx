import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeSync } from "@/components/layout/theme-sync";

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
      <body><ThemeSync />{children}</body>
    </html>
  );
}
