export const PASSWORD_RECOVERY_TTL_MS = 5 * 60 * 1000;

const EMAIL_KEY = "aiko-password-recovery-email";
const SENT_AT_KEY = "aiko-password-recovery-sent-at";

export interface PasswordRecoveryAttempt {
  email: string;
  sentAt: number;
}

export function savePasswordRecoveryAttempt(
  email: string,
  sentAt = Date.now(),
): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
  window.sessionStorage.setItem(SENT_AT_KEY, String(sentAt));
}

export function readPasswordRecoveryAttempt(): PasswordRecoveryAttempt | null {
  if (typeof window === "undefined") return null;
  const email = window.sessionStorage.getItem(EMAIL_KEY)?.trim();
  const sentAtValue = window.sessionStorage.getItem(SENT_AT_KEY);
  const sentAt = sentAtValue ? Number(sentAtValue) : Number.NaN;
  if (!email || !Number.isFinite(sentAt)) return null;
  return { email, sentAt };
}

export function clearPasswordRecoveryAttempt(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(EMAIL_KEY);
  window.sessionStorage.removeItem(SENT_AT_KEY);
}

export function passwordRecoveryRemainingMs(
  sentAt: number,
  now = Date.now(),
): number {
  return Math.max(0, PASSWORD_RECOVERY_TTL_MS - (now - sentAt));
}
