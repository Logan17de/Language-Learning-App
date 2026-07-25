"use client";

import {
  clearGoogleOAuthStorage,
  createClient,
  createGoogleOAuthClient,
} from "@/lib/supabase/client";
import { getAppUrl } from "@/lib/supabase/config";
import { isStrongEnough } from "@/lib/auth/password-strength";
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
    return "Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.";

  return "Authentication could not be completed. Please try again.";
}

export const authService = {
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
    if (!profile.data || profile.data.status !== "active") return success(null);
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
  ): Promise<RepositoryResult<{ confirmationRequired: boolean }>> {
    if (!isStrongEnough(password)) {
      return failure(
        { code: "WEAK_PASSWORD" },
        "Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.",
      );
    }
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getAppUrl()}/auth/callback?next=/onboarding`,
        data: { display_name: displayName },
      },
    });
    return error
      ? failure(error, friendlyAuthMessage(error.message, error.code))
      : success({ confirmationRequired: !data.session });
  },

  async signIn(
    email: string,
    password: string,
  ): Promise<RepositoryResult<AuthIdentity>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return failure(error, friendlyAuthMessage(error.message, error.code));
    const [profile, preferences] = await Promise.all([
      client
        .from("profiles")
        .select("display_name,role,status,subscription_plan")
        .eq("id", data.user.id)
        .single(),
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
    if (profile.data.status !== "active") {
      await client.auth.signOut();
      return failure(
        { code: "42501" },
        "This account is not active. Contact support.",
      );
    }
    return success({
      id: data.user.id,
      email: data.user.email ?? email,
      displayName: profile.data.display_name,
      role: profile.data.role,
      subscriptionPlan: profile.data.subscription_plan,
      onboardingComplete: preferences.data?.onboarding_complete ?? false,
    });
  },

  async signInWithGoogle(
    mode: "login" | "signup",
    next?: string,
  ): Promise<RepositoryResult<null>> {
    clearGoogleOAuthStorage();
    const client = createGoogleOAuthClient();
    if (!client) return notConfigured();
    const safeNext =
      next?.startsWith("/") && !next.startsWith("//") ? next : null;
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
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password`,
    });
    return error
      ? failure(error, friendlyAuthMessage(error.message, error.code))
      : success(null);
  },

  async updatePassword(password: string): Promise<RepositoryResult<null>> {
    if (!isStrongEnough(password)) {
      return failure(
        { code: "WEAK_PASSWORD" },
        "Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.",
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
