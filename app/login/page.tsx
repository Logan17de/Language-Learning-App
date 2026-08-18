import type { Metadata } from "next";
import { LoginRecoveryFlow } from "@/components/auth/login-recovery-flow";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return <LoginRecoveryFlow />;
}
