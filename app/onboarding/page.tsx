import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const metadata: Metadata = {
  title: "Set up your learning path",
  description: "Choose your starting level and learning preferences for AIko.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/onboarding" },
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
