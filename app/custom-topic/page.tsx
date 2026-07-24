import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { CustomTopicPage } from "@/components/custom-topic/custom-topic-page";

export const metadata: Metadata = { title: "Custom Topic" };
export default function CustomTopicRoute() { return <AppShell><CustomTopicPage /></AppShell>; }
