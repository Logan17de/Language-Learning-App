import type { Metadata } from "next";
import { SignupFlow } from "@/components/auth/signup-flow";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your AIko language-learning account.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  return <SignupFlow />;
}
