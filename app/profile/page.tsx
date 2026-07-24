import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ProfilePage } from "@/components/profile/profile-page";

export const metadata: Metadata = { title: "Profile" };
export default function ProfileRoute() { return <AppShell><ProfilePage /></AppShell>; }
