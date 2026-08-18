import type { Metadata } from "next";
import { LoginRecoveryFlow } from "@/components/auth/login-recovery-flow";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your AIko language-learning account.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return <LoginRecoveryFlow />;
}
