"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Brand } from "@/components/ui/brand";
import { createClient } from "@/lib/supabase/client";
import { canAccessAdmin, type AppRole } from "@/lib/auth/permissions";
import { useAdminStore } from "@/store/admin-store";

function returnToAuth(adminFlow: boolean, error: string) {
  const target = new URL(adminFlow ? "/admin/login" : "/login", window.location.origin);
  target.searchParams.set("error", error);
  window.location.replace(target.toString());
}

export function OAuthCallback() {
  const started = useRef(false);
  const [status, setStatus] = useState("Completing your sign-in…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function complete() {
      const url = new URL(window.location.href);
      const adminFlow = url.searchParams.get("flow") === "admin";
      const requestedNext = url.searchParams.get("next");
      const explicitNext =
        requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
          ? requestedNext
          : null;

      if (url.searchParams.has("error")) {
        returnToAuth(adminFlow, "oauth-cancelled");
        return;
      }

      const code = url.searchParams.get("code");
      const client = createClient();
      if (!client) {
        returnToAuth(adminFlow, "backend-not-configured");
        return;
      }
      if (!code) {
        returnToAuth(adminFlow, "auth-callback");
        return;
      }

      setStatus("Securing your AIko session…");
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        const lower = exchangeError.message.toLowerCase();
        const reason =
          exchangeError.code === "bad_code_verifier" || lower.includes("code verifier")
            ? "oauth-verifier"
            : exchangeError.code === "flow_state_expired" ||
                exchangeError.code === "flow_state_not_found"
              ? "oauth-expired"
              : "oauth-exchange";
        returnToAuth(adminFlow, reason);
        return;
      }

      window.history.replaceState({}, "", "/auth/callback");

      const { data: auth, error: userError } = await client.auth.getUser();
      if (userError || !auth.user) {
        returnToAuth(adminFlow, "oauth-exchange");
        return;
      }

      if (adminFlow) {
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
          returnToAuth(true, "admin-access-denied");
          return;
        }

        useAdminStore.getState().establishBackendSession(
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

      if (explicitNext === "/reset-password") {
        window.location.replace(explicitNext);
        return;
      }

      const preferences = await client
        .from("user_preferences")
        .select("onboarding_complete")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      const onboardingComplete = preferences.data?.onboarding_complete ?? false;
      window.location.replace(
        onboardingComplete ? (explicitNext ?? "/home") : "/onboarding",
      );
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
