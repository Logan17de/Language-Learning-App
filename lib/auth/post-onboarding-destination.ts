import { safeInternalRedirect } from "@/lib/auth/safe-internal-redirect";

const BLOCKED_POST_ONBOARDING_PREFIXES = [
  "/onboarding",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/admin",
];

export function safePostOnboardingDestination(
  value: string | null | undefined,
): string | null {
  const safe = safeInternalRedirect(value);
  if (!safe) return null;

  const pathname = new URL(safe, "https://aiko.local").pathname;
  const blocked = BLOCKED_POST_ONBOARDING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return blocked ? null : safe;
}
