"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Brand } from "@/components/ui/brand";
import {
  clearGoogleOAuthStorage,
  createClient,
  createGoogleOAuthClient,
} from "@/lib/supabase/client";
import { canAccessAdmin, type AppRole } from "@/lib/auth/permissions";
import { safeInternalRedirect } from "@/lib/auth/safe-internal-redirect";
import { useAdminSessionStore } from "@/store/admin-session-store";

type GoogleFlow = "login" | "signup" | "admin";

function returnToAuth(
  flow: GoogleFlow | null,
  error: string,
  next?: string | null,
) {
  const pathname =
    flow === "signup"
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

export function OAuthCallback() {
  const started = useRef(false);
  const [status, setStatus] = useState("Completing your Google sign-in…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function complete() {
      const url = new URL(window.location.href);
      const requestedFlow = url.searchParams.get("flow");
      const googleFlow: GoogleFlow | null =
        requestedFlow === "login" ||
        requestedFlow === "signup" ||
        requestedFlow === "admin"
          ? requestedFlow
          : null;
      const explicitNext = safeInternalRedirect(url.searchParams.get("next"));

      if (url.searchParams.has("error")) {
        returnToAuth(googleFlow, "oauth-cancelled", explicitNext);
        return;
      }

      const code = url.searchParams.get("code");
      const client = createClient();
      const exchangeClient = googleFlow
        ? createGoogleOAuthClient()
        : client;
      if (!client || !exchangeClient) {
        returnToAuth(googleFlow, "backend-not-configured", explicitNext);
        return;
      }
      if (!code) {
        returnToAuth(googleFlow, "auth-callback", explicitNext);
        return;
      }

      setStatus("Securing your AIko session…");
      const { data: exchangeData, error: exchangeError } =
        await exchangeClient.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        const lower = exchangeError.message.toLowerCase();
        const reason =
          exchangeError.code === "bad_code_verifier" ||
          lower.includes("code verifier")
            ? "oauth-verifier"
            : exchangeError.code === "flow_state_expired" ||
                exchangeError.code === "flow_state_not_found"
              ? "oauth-expired"
              : "oauth-exchange";
        returnToAuth(googleFlow, reason, explicitNext);
        return;
      }

      if (googleFlow) {
        if (!exchangeData.session) {
          returnToAuth(googleFlow, "oauth-exchange", explicitNext);
          return;
        }
        const { error: sessionError } = await client.auth.setSession({
          access_token: exchangeData.session.access_token,
          refresh_token: exchangeData.session.refresh_token,
        });
        if (sessionError) {
          returnToAuth(googleFlow, "oauth-exchange", explicitNext);
          return;
        }
        clearGoogleOAuthStorage();
      }

      window.history.replaceState({}, "", "/auth/callback");

      const { data: auth, error: userError } = await client.auth.getUser();
      if (userError || !auth.user) {
        await client.auth.signOut({ scope: "local" });
        returnToAuth(googleFlow, "oauth-exchange", explicitNext);
        return;
      }

      if (googleFlow && googleFlow !== "admin") {
        const registrationComplete =
          auth.user.user_metadata?.aiko_google_registration_complete;
        const createdAt = Date.parse(auth.user.created_at);
        const newlyCreated =
          Number.isFinite(createdAt) && Date.now() - createdAt < 5 * 60 * 1000;

        if (
          googleFlow === "login" &&
          (registrationComplete === false ||
            (registrationComplete !== true && newlyCreated))
        ) {
          await client.auth.updateUser({
            data: { aiko_google_registration_complete: false },
          });
          await client.auth.signOut({ scope: "local" });
          returnToAuth(googleFlow, "no-google-account", explicitNext);
          return;
        }

        if (registrationComplete !== true) {
          await client.auth.updateUser({
            data: { aiko_google_registration_complete: true },
          });
        }
      }

      if (googleFlow === "admin") {
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
        returnToAuth(googleFlow, "profile-load", explicitNext);
        return;
      }
      if (profile.data.status !== "active") {
        await client.auth.signOut({ scope: "local" });
        returnToAuth(googleFlow, "account-inactive", explicitNext);
        return;
      }
      if (preferences.error) {
        await client.auth.signOut({ scope: "local" });
        returnToAuth(googleFlow, "preferences-load", explicitNext);
        return;
      }

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
          Finishing sign-in
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">{status}</p>
      </div>
    </main>
  );
}
