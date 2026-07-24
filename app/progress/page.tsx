import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ProgressDashboard } from "@/components/progress/progress-dashboard";

export const metadata: Metadata = { title: "Progress" };
export default function ProgressPage() { return <AppShell><ProgressDashboard /></AppShell>; }
