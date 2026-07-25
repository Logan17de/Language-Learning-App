"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Brand } from "@/components/ui/brand";
import { createClient } from "@/lib/supabase/client";

type GoogleFlow = "login" | "signup";

function returnToAuth(flow: GoogleFlow | null, error: string) {
  const target = new URL(flow === "signup" ? "/signup" : "/login", window.location.origin);
  target.searchParams.set("error", error);
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
        requestedFlow === "login" || requestedFlow === "signup"
          ? requestedFlow
          : null;
      const requestedNext = url.searchParams.get("next");
      const explicitNext =
        requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
          ? requestedNext
          : null;

      if (url.searchParams.has("error")) {
        returnToAuth(googleFlow, "oauth-cancelled");
        return;
      }

      const code = url.searchParams.get("code");
      const client = createClient();
      if (!client) {
        returnToAuth(googleFlow, "backend-not-configured");
        return;
      }
      if (!code) {
        returnToAuth(googleFlow, "auth-callback");
        return;
      }

      setStatus("Securing your AIko session…");
      const { error: exchangeError } =
        await client.auth.exchangeCodeForSession(code);
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
        returnToAuth(googleFlow, reason);
        return;
      }

      // Remove the one-time authorization code before any further navigation.
      window.history.replaceState({}, "", "/auth/callback");

      const { data: auth, error: userError } = await client.auth.getUser();
      if (userError || !auth.user) {
        returnToAuth(googleFlow, "oauth-exchange");
        return;
      }

      if (googleFlow) {
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
          returnToAuth(googleFlow, "no-google-account");
          return;
        }

        if (registrationComplete !== true) {
          await client.auth.updateUser({
            data: { aiko_google_registration_complete: true },
          });
        }
      }

      const preferences = await client
        .from("user_preferences")
        .select("onboarding_complete")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      const onboardingComplete =
        preferences.data?.onboarding_complete ?? false;
      const next = onboardingComplete
        ? (explicitNext ?? "/home")
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
