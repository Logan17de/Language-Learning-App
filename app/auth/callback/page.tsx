import type { Metadata } from "next";
import { OAuthCallback } from "@/components/auth/oauth-callback";

export const metadata: Metadata = {
  title: "Completing account setup",
  description: "Completing secure AIko account authentication.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/auth/callback" },
};
export const dynamic = "force-dynamic";

export default function OAuthCallbackPage() {
  return <OAuthCallback />;
}
