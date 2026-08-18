"use client";

import {
  clearGoogleOAuthStorage,
  createClient,
  createGoogleOAuthClient,
} from "@/lib/supabase/client";
import { getAppUrl } from "@/lib/supabase/config";
import {
  isStrongEnough,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "@/lib/auth/password-strength";
import { safeInternalRedirect } from "@/lib/auth/safe-internal-redirect";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type { AppRole } from "@/lib/auth/permissions";

export interface AuthIdentity {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  subscriptionPlan: "free" | "premium_monthly" | "premium_annual";
  onboardingComplete: boolean;
}

function friendlyAuthMessage(message: string, code?: string): string {
  const lower = message.toLowerCase();
  const normalizedCode = code?.toLowerCase();

  if (
    normalizedCode === "invalid_credentials" ||
    lower.includes("invalid credentials") ||
    lower.includes("invalid login") ||
    lower.includes("incorrect email") ||
    lower.includes("incorrect password")
  )
    return "No matching account was found, or the password is incorrect. If you are new to AIko, create an account first.";

  if (
    normalizedCode === "email_not_confirmed" ||
    lower.includes("email not confirmed")
  )
    return "Confirm your email using the link we sent before signing in.";

  if (
    normalizedCode === "email_provider_disabled" ||
    lower.includes("email logins are disabled") ||
    lower.includes("email provider is disabled")
  )
    return "Email and password sign-in is not enabled yet. Use Google sign-in or contact support.";

  if (
    normalizedCode === "user_already_exists" ||
    lower.includes("already registered") ||
    lower.includes("already exists")
  )
    return "An account already exists for this email. Log in instead.";

  if (
    normalizedCode === "weak_password" ||
    lower.includes("weak password") ||
    lower.includes("password should")
  )
    return PASSWORD_REQUIREMENTS_MESSAGE;

  if (
    normalizedCode === "bad_jwt" ||
    lower.includes("invalid api key") ||
    lower.includes("invalid api-key") ||
    lower.includes("invalid jwt")
  )
    return "AIko authentication is not configured correctly for this deployment. Please contact support.";

  if (
    normalizedCode === "provider_disabled" ||
    lower.includes("unsupported provider") ||
    lower.includes("provider is not enabled")
  )
    return "Google sign-in is not enabled for this deployment yet.";

  if (
    normalizedCode === "unexpected_failure" ||
    lower.includes("database error") ||
    lower.includes("saving new user")
  )
    return "AIko could not create your learner profile. Please contact support.";

  if (
    normalizedCode === "over_request_rate_limit" ||
    normalizedCode === "over_email_send_rate_limit" ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  )
    return "Too many authentication attempts were made. Wait a moment, then try again.";

  return "Authentication could not be completed. Please try again.";
}

function friendlyRecoveryCodeMessage(message: string, code?: string): string {
  const lower = message.toLowerCase();
  const normalizedCode = code?.toLowerCase();

  if (
    normalizedCode === "otp_expired" ||
    normalizedCode === "otp_disabled" ||
    lower.includes("expired")
  ) {
    return "That code has expired. Request a new password-reset code.";
  }

  if (
    normalizedCode === "otp_invalid" ||
    normalizedCode === "invalid_otp" ||
    lower.includes("invalid") ||
    lower.includes("token")
  ) {
    return "That code is incorrect. Check the 6 digits and try again.";
  }

  return "That code could not be verified. Check the 6 digits and try again.";
}

async function loadActiveIdentity(
  client: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  fallbackEmail: string,
): Promise<RepositoryResult<AuthIdentity>> {
  const [profile, preferences] = await Promise.all([
    client
      .from("profiles")
      .select("display_name,role,status,subscription_plan")
      .eq("id", userId)
      .single(),
    client
      .from("user_preferences")
      .select("onboarding_complete")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (profile.error) {
    await client.auth.signOut({ scope: "local" });
    return failure(profile.error, "Your profile could not be loaded.");
  }
  if (preferences.error) {
    await client.auth.signOut({ scope: "local" });
    return failure(
      preferences.error,
      "Your onboarding status could not be loaded.",
    );
  }
  if (profile.data.status !== "active") {
    await client.auth.signOut({ scope: "local" });
    return failure(
      { code: "42501" },
      "This account is not active. Contact support.",
    );
  }
  return success({
    id: userId,
    email: fallbackEmail,
    displayName: profile.data.display_name,
    role: profile.data.role,
    subscriptionPlan: profile.data.subscription_plan,
    onboardingComplete: preferences.data?.onboarding_complete ?? false,
  });
}

function emailConfirmationCallback(next?: string) {
  const callbackUrl = new URL("/auth/callback", getAppUrl());
  callbackUrl.searchParams.set("flow", "email-confirmation");
  const safeNext = safeInternalRedirect(next);
  if (safeNext) callbackUrl.searchParams.set("next", safeNext);
  return callbackUrl.toString();
}

export const authService = {
  async hasSession(): Promise<boolean> {
    const client = createClient();
    if (!client) return false;
    const { data, error } = await client.auth.getSession();
    if (error) return false;
    return Boolean(data.session?.user);
  },

  async getIdentity(): Promise<RepositoryResult<AuthIdentity | null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.auth.getUser();
    if (error) return failure(error, "Your session could not be restored.");
    if (!data.user) return success(null);
    const [profile, preferences] = await Promise.all([
      client
        .from("profiles")
        .select("display_name,role,status,subscription_plan")
        .eq("id", data.user.id)
        .maybeSingle(),
      client
        .from("user_preferences")
        .select("onboarding_complete")
        .eq("user_id", data.user.id)
        .maybeSingle(),
    ]);
    if (profile.error)
      return failure(profile.error, "Your profile could not be loaded.");
    if (preferences.error)
      return failure(
        preferences.error,
        "Your onboarding status could not be loaded.",
      );
    if (!profile.data || profile.data.status !== "active") {
      await client.auth.signOut({ scope: "local" });
      return success(null);
    }
    return success({
      id: data.user.id,
      email: data.user.email ?? "",
      displayName: profile.data.display_name,
      role: profile.data.role,
      subscriptionPlan: profile.data.subscription_plan,
      onboardingComplete: preferences.data?.onboarding_complete ?? false,
    });
  },

  subscribe(listener: (signedIn: boolean) => void): () => void {
    const client = createClient();
    if (!client) return () => undefined;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      listener(event !== "SIGNED_OUT" && Boolean(session?.user));
    });
    return () => data.subscription.unsubscribe();
  },

  async signUp(
    email: string,
    password: string,
    displayName: string,
    next?: string,
  ): Promise<
    RepositoryResult<{
      confirmationRequired: boolean;
      identity: AuthIdentity | null;
    }>
  > {
    if (!isStrongEnough(password)) {
      return failure(
        { code: "WEAK_PASSWORD" },
        PASSWORD_REQUIREMENTS_MESSAGE,
      );
    }
    const client = createClient();
    if (!client) return notConfigured();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedDisplayName = displayName.trim();
    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: emailConfirmationCallback(next),
        data: { display_name: normalizedDisplayName },
      },
    });
    if (error) {
      return failure(error, friendlyAuthMessage(error.message, error.code));
    }
    if (!data.session) {
      return success({ confirmationRequired: true, identity: null });
    }

    const identity = await loadActiveIdentity(
      client,
      data.session.user.id,
      data.session.user.email ?? normalizedEmail,
    );
    if (!identity.ok) return identity;
    return success({ confirmationRequired: false, identity: identity.data });
  },

  async resendSignUpConfirmation(
    email: string,
    next?: string,
  ): Promise<RepositoryResult<null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { error } = await client.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: emailConfirmationCallback(next) },
    });
    return error
      ? failure(error, friendlyAuthMessage(error.message, error.code))
      : success(null);
  },

  async signIn(
    email: string,
    password: string,
  ): Promise<RepositoryResult<AuthIdentity>> {
    const client = createClient();
    if (!client) return notConfigured();
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) return failure(error, friendlyAuthMessage(error.message, error.code));
    return loadActiveIdentity(
      client,
      data.user.id,
      data.user.email ?? normalizedEmail,
    );
  },

  async signInWithGoogle(
    mode: "login" | "signup" | "admin",
    next?: string,
  ): Promise<RepositoryResult<null>> {
    clearGoogleOAuthStorage();
    const client = createGoogleOAuthClient();
    if (!client) return notConfigured();
    const safeNext = safeInternalRedirect(next);
    const callbackUrl = new URL("/auth/callback", getAppUrl());
    callbackUrl.searchParams.set("flow", mode);
    if (safeNext) callbackUrl.searchParams.set("next", safeNext);
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    return error
      ? failure(error, friendlyAuthMessage(error.message, error.code))
      : success(null);
  },

  async signOut(): Promise<RepositoryResult<null>> {
    const client = createClient();
    if (!client) return success(null);
    const { error } = await client.auth.signOut();
    return error
      ? failure(error, "You could not be signed out.")
      : success(null);
  },

  async requestPasswordReset(email: string): Promise<RepositoryResult<null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { error } = await client.auth.resetPasswordForEmail(email);
    return error
      ? failure(error, friendlyAuthMessage(error.message, error.code))
      : success(null);
  },

  async verifyPasswordResetCode(
    email: string,
    token: string,
  ): Promise<RepositoryResult<null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { error } = await client.auth.verifyOtp({
      email,
      token,
      type: "recovery",
    });
    return error
      ? failure(error, friendlyRecoveryCodeMessage(error.message, error.code))
      : success(null);
  },

  async updatePassword(password: string): Promise<RepositoryResult<null>> {
    if (!isStrongEnough(password)) {
      return failure(
        { code: "WEAK_PASSWORD" },
        PASSWORD_REQUIREMENTS_MESSAGE,
      );
    }
    const client = createClient();
    if (!client) return notConfigured();
    const { error } = await client.auth.updateUser({ password });
    return error
      ? failure(error, friendlyAuthMessage(error.message, error.code))
      : success(null);
  },
};
