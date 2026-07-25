import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const explicitNext =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : null;
  const client = await createClient();

  if (!client) {
    return NextResponse.redirect(
      new URL("/login?error=backend-not-configured", request.url),
    );
  }

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: auth } = await client.auth.getUser();
      const preferences = auth.user
        ? await client
            .from("user_preferences")
            .select("onboarding_complete")
            .eq("user_id", auth.user.id)
            .maybeSingle()
        : null;
      const onboardingComplete =
        preferences?.data?.onboarding_complete ?? false;
      const next = onboardingComplete
        ? (explicitNext ?? "/home")
        : "/onboarding";
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=auth-callback", request.url),
  );
}
