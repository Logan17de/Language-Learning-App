import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "Settings" };
export default function SettingsRoute() { return <AppShell><SettingsPage /></AppShell>; }
