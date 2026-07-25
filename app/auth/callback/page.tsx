import type { Metadata } from "next";
import { OAuthCallback } from "@/components/auth/oauth-callback";

export const metadata: Metadata = { title: "Completing sign-in" };
export const dynamic = "force-dynamic";

export default function OAuthCallbackPage() {
  return <OAuthCallback />;
}
