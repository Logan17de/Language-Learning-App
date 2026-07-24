"use client";

import { createClient } from "@/lib/supabase/client";
import { getAppUrl } from "@/lib/supabase/config";
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

function friendlyAuthMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login"))
    return "The email or password is incorrect.";
  if (lower.includes("already registered"))
    return "An account already exists for this email.";
  if (lower.includes("email not confirmed"))
    return "Confirm your email before signing in.";
  if (lower.includes("password"))
    return "Use a stronger password with at least 8 characters.";
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
      ? failure(error, friendlyAuthMessage(error.message))
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
    if (error) return failure(error, friendlyAuthMessage(error.message));
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

  async signInWithGoogle(next?: string): Promise<RepositoryResult<null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const safeNext =
      next?.startsWith("/") && !next.startsWith("//") ? next : null;
    const redirectTo = safeNext
      ? `${getAppUrl()}/auth/callback?next=${encodeURIComponent(safeNext)}`
      : `${getAppUrl()}/auth/callback`;
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    return error
      ? failure(error, friendlyAuthMessage(error.message))
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
      ? failure(error, friendlyAuthMessage(error.message))
      : success(null);
  },

  async updatePassword(password: string): Promise<RepositoryResult<null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { error } = await client.auth.updateUser({ password });
    return error
      ? failure(error, friendlyAuthMessage(error.message))
      : success(null);
  },
};
