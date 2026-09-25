"use client";

import { safeInternalRedirect } from "@/lib/auth/safe-internal-redirect";

const STORAGE_KEY = "aiko-pending-signup-confirmation";
export const SIGNUP_CONFIRMATION_RESEND_COOLDOWN_MS = 60_000;

export interface PendingSignupConfirmation {
  email: string;
  next: string | null;
  sentAt: number;
}

export function savePendingSignupConfirmation(
  email: string,
  next?: string | null,
): PendingSignupConfirmation {
  const pending: PendingSignupConfirmation = {
    email: email.trim().toLowerCase(),
    next: safeInternalRedirect(next),
    sentAt: Date.now(),
  };

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  }
  return pending;
}

export function readPendingSignupConfirmation(): PendingSignupConfirmation | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingSignupConfirmation>;
    if (typeof parsed.email !== "string" || typeof parsed.sentAt !== "number") {
      return null;
    }
    return {
      email: parsed.email.trim().toLowerCase(),
      next: safeInternalRedirect(parsed.next),
      sentAt: parsed.sentAt,
    };
  } catch {
    return null;
  }
}

export function clearPendingSignupConfirmation() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function signupConfirmationResendRemainingMs(sentAt: number) {
  return Math.max(
    0,
    SIGNUP_CONFIRMATION_RESEND_COOLDOWN_MS - (Date.now() - sentAt),
  );
}
