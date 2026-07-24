import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SubscriptionPage } from "@/components/subscription/subscription-page";

export const metadata: Metadata = { title: "Subscription" };
export default function SubscriptionRoute() { return <AppShell><SubscriptionPage /></AppShell>; }
