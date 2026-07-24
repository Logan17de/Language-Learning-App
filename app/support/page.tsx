import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SupportPage } from "@/components/support/support-page";

export const metadata: Metadata = { title: "Support" };
export default function SupportRoute() { return <AppShell><SupportPage /></AppShell>; }
