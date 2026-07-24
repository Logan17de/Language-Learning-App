import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessAdminPath, type AppRole } from "@/lib/auth/permissions";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

const learnerPrefixes = ["/home", "/learn", "/review", "/progress", "/custom-topic", "/profile", "/settings", "/subscription", "/lesson"];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const config = getSupabasePublicConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  const pathname = request.nextUrl.pathname;
  const isAdminLogin = pathname === "/admin/login";
  const protectedLearner = learnerPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const protectedAdmin = pathname === "/admin" || (pathname.startsWith("/admin/") && !isAdminLogin);

  if (!userId && (protectedLearner || protectedAdmin)) {
    const url = request.nextUrl.clone();
    url.pathname = protectedAdmin ? "/admin/login" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (userId && protectedAdmin) {
    const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", userId).maybeSingle();
    const role = profile?.role as AppRole | undefined;
    if (!profile || !role || profile.status !== "active" || !canAccessAdminPath(role, pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = role && canAccessAdminPath(role, "/admin") ? "/admin" : "/home";
      url.searchParams.set("permission", "denied");
      return NextResponse.redirect(url);
    }
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
