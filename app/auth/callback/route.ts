import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GoogleFlow = "login" | "signup";

function authRedirect(
  request: NextRequest,
  path: "/login" | "/signup",
  error: string,
) {
  const target = new URL(path, request.url);
  target.searchParams.set("error", error);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
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
  const client = await createClient();

  if (!client) {
    return authRedirect(
      request,
      googleFlow === "signup" ? "/signup" : "/login",
      "backend-not-configured",
    );
  }

  if (!code) {
    return authRedirect(
      request,
      googleFlow === "signup" ? "/signup" : "/login",
      url.searchParams.has("error") ? "oauth-cancelled" : "auth-callback",
    );
  }

  const { error: exchangeError } =
    await client.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return authRedirect(
      request,
      googleFlow === "signup" ? "/signup" : "/login",
      "oauth-exchange",
    );
  }

  const { data: auth, error: userError } = await client.auth.getUser();
  if (userError || !auth.user) {
    return authRedirect(
      request,
      googleFlow === "signup" ? "/signup" : "/login",
      "oauth-exchange",
    );
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
      return authRedirect(request, "/login", "no-google-account");
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
  return NextResponse.redirect(new URL(next, request.url));
}
