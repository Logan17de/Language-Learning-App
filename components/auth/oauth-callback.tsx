"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Brand } from "@/components/ui/brand";
import { createClient } from "@/lib/supabase/client";
import { canAccessAdmin, type AppRole } from "@/lib/auth/permissions";
import { clearPendingSignupConfirmation } from "@/lib/auth/pending-signup-confirmation";
import { safeInternalRedirect } from "@/lib/auth/safe-internal-redirect";
import { useAdminSessionStore } from "@/store/admin-session-store";

type AuthCallbackFlow = "admin" | "email-confirmation";

function callbackParam(url: URL, key: string) {
  const queryValue = url.searchParams.get(key);
  if (queryValue) return queryValue;
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  return new URLSearchParams(hash).get(key);
}

function returnToAuth(
  flow: AuthCallbackFlow | null,
  error: string,
  next?: string | null,
) {
  const pathname =
    flow === "email-confirmation"
      ? "/signup"
      : flow === "admin"
        ? "/admin/login"
        : "/login";
  const target = new URL(pathname, window.location.origin);
  target.searchParams.set("error", error);
  const safeNext = safeInternalRedirect(next);
  if (safeNext) target.searchParams.set("next", safeNext);
  window.location.replace(target.toString());
}

function confirmationErrorReason(url: URL, fallback?: string) {
  const errorCode = callbackParam(url, "error_code")?.toLowerCase() ?? "";
  const description =
    callbackParam(url, "error_description")?.toLowerCase() ??
    fallback?.toLowerCase() ??
    "";
  return errorCode.includes("expired") || description.includes("expired")
    ? "confirmation-expired"
    : "confirmation-failed";
}

export function OAuthCallback() {
  const started = useRef(false);
  const [status, setStatus] = useState("Completing account setup…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function complete() {
      const url = new URL(window.location.href);
      const requestedFlow = url.searchParams.get("flow");
      const callbackFlow: AuthCallbackFlow | null =
        requestedFlow === "admin" || requestedFlow === "email-confirmation"
          ? requestedFlow
          : null;
      const explicitNext = safeInternalRedirect(url.searchParams.get("next"));
      const callbackError = callbackParam(url, "error");

      if (callbackError) {
        returnToAuth(
          callbackFlow,
          callbackFlow === "email-confirmation"
            ? confirmationErrorReason(url)
            : "oauth-cancelled",
          explicitNext,
        );
        return;
      }

      const code = callbackParam(url, "code");
      const client = createClient();
      if (!client) {
        returnToAuth(callbackFlow, "backend-not-configured", explicitNext);
        return;
      }
      if (!code) {
        returnToAuth(
          callbackFlow,
          callbackFlow === "email-confirmation"
            ? "confirmation-failed"
            : "auth-callback",
          explicitNext,
        );
        return;
      }

      setStatus(
        callbackFlow === "email-confirmation"
          ? "Confirming your email…"
          : "Securing your AIko admin session…",
      );
      const { error: exchangeError } =
        await client.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        if (callbackFlow === "email-confirmation") {
          returnToAuth(
            callbackFlow,
            confirmationErrorReason(url, exchangeError.message),
            explicitNext,
          );
          return;
        }
        returnToAuth(callbackFlow, "oauth-exchange", explicitNext);
        return;
      }

      window.history.replaceState({}, "", "/auth/callback");

      const { data: auth, error: userError } = await client.auth.getUser();
      if (userError || !auth.user) {
        await client.auth.signOut({ scope: "local" });
        returnToAuth(
          callbackFlow,
          callbackFlow === "email-confirmation"
            ? "confirmation-failed"
            : "oauth-exchange",
          explicitNext,
        );
        return;
      }

      if (callbackFlow === "admin") {
        const profile = await client
          .from("profiles")
          .select("email,display_name,role,status")
          .eq("id", auth.user.id)
          .maybeSingle();
        const role = profile.data?.role as AppRole | undefined;

        if (
          profile.error ||
          !profile.data ||
          profile.data.status !== "active" ||
          !role ||
          !canAccessAdmin(role)
        ) {
          await client.auth.signOut({ scope: "local" });
          returnToAuth("admin", "admin-access-denied", explicitNext);
          return;
        }

        useAdminSessionStore.getState().establishBackendSession(
          profile.data.email ?? auth.user.email ?? "",
          profile.data.display_name,
          role.replace("_", " "),
        );
        const adminNext = explicitNext?.startsWith("/admin")
          ? explicitNext
          : "/admin";
        window.location.replace(adminNext);
        return;
      }

      const [profile, preferences] = await Promise.all([
        client
          .from("profiles")
          .select("status")
          .eq("id", auth.user.id)
          .maybeSingle(),
        client
          .from("user_preferences")
          .select("onboarding_complete")
          .eq("user_id", auth.user.id)
          .maybeSingle(),
      ]);

      if (profile.error || !profile.data) {
        await client.auth.signOut({ scope: "local" });
        returnToAuth(callbackFlow, "profile-load", explicitNext);
        return;
      }
      if (profile.data.status !== "active") {
        await client.auth.signOut({ scope: "local" });
        returnToAuth(callbackFlow, "account-inactive", explicitNext);
        return;
      }
      if (preferences.error) {
        await client.auth.signOut({ scope: "local" });
        returnToAuth(callbackFlow, "preferences-load", explicitNext);
        return;
      }

      clearPendingSignupConfirmation();

      const onboardingComplete =
        preferences.data?.onboarding_complete ?? false;
      const next = onboardingComplete
        ? (explicitNext ?? "/home")
        : explicitNext
          ? `/onboarding?next=${encodeURIComponent(explicitNext)}`
          : "/onboarding";
      window.location.replace(next);
    }

    void complete();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5">
      <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-soft">
        <div className="flex justify-center">
          <Brand />
        </div>
        <LoaderCircle className="mx-auto mt-10 size-8 animate-spin text-moss-700" />
        <h1 className="mt-6 text-2xl font-semibold text-ink">
          Completing account setup
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">{status}</p>
      </div>
    </main>
  );
}
