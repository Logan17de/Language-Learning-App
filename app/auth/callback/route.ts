import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/home";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/home";
  const client = await createClient();
  if (!client) return NextResponse.redirect(new URL("/login?error=backend-not-configured", request.url));
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=auth-callback", request.url));
}
