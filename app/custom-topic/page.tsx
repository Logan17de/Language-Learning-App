import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { CustomTopicRouteClient } from "@/components/custom-topic/custom-topic-route-client";

export const metadata: Metadata = { title: "Custom Topic" };

export default function CustomTopicRoute() {
  return (
    <AppShell>
      <CustomTopicRouteClient />
    </AppShell>
  );
}
