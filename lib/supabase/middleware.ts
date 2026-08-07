import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessAdminPath } from "@/lib/auth/permissions";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

const learnerPrefixes = [
  "/home",
  "/learn",
  "/review",
  "/progress",
  "/custom-topic",
  "/profile",
  "/settings",
  "/subscription",
  "/lesson",
];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const isAdminLogin = pathname === "/admin/login";
  const anyAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const protectedAdmin = anyAdminPath && !isAdminLogin;
  const protectedLearner = learnerPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  const config = getSupabasePublicConfig();
  if (!config) {
    // Demo admin exists only for local development. A production deployment
    // with missing backend configuration must never fall back to mock admin.
    if (process.env.NODE_ENV === "production" && anyAdminPath) {
      return new NextResponse("Not Found", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId =
    typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;

  if (!userId && (protectedLearner || protectedAdmin)) {
    const url = request.nextUrl.clone();
    url.pathname = protectedAdmin ? "/admin/login" : "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (userId && protectedAdmin) {
    const [profile, effectiveRole] = await Promise.all([
      supabase.from("profiles").select("status").eq("id", userId).maybeSingle(),
      supabase.rpc("current_app_role"),
    ]);
    const role = effectiveRole.data;

    if (
      profile.error ||
      !profile.data ||
      profile.data.status !== "active" ||
      effectiveRole.error ||
      !role ||
      !canAccessAdminPath(role, pathname)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/home";
      url.searchParams.set("permission", "denied");
      return NextResponse.redirect(url);
    }
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
