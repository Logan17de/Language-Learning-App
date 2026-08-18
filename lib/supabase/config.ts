import { AIKO_CANONICAL_ORIGIN } from "@/lib/app-url";

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export type BackendMode = "supabase" | "demo";

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const legacyAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const anonKey = publishableKey || legacyAnonKey;
  if (
    !url ||
    !anonKey ||
    url.includes("your-project") ||
    anonKey.includes("your-") ||
    anonKey === url ||
    anonKey.includes("supabase.co")
  )
    return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return { url, anonKey };
}

export function getBackendMode(): BackendMode {
  return getSupabasePublicConfig() ? "supabase" : "demo";
}

export function requireSupabasePublicConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }
  return config;
}

export function getAppUrl(): string {
  // Browser auth starts from the origin the learner is actually using. Production
  // Vercel hostnames are redirected to the canonical zetbros.com origin by proxy.ts,
  // while localhost and staging previews remain independently testable.
  if (typeof window !== "undefined") return window.location.origin;

  // Production must never fall back to a generated Vercel hostname or a stale
  // NEXT_PUBLIC_APP_URL value. All server-owned production links use AIko's domain.
  if (process.env.VERCEL_ENV === "production") return AIKO_CANONICAL_ORIGIN;

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configuredUrl) return configuredUrl;

  const vercelUrl = process.env.VERCEL_URL;
  return vercelUrl
    ? "https://" + vercelUrl.replace(/\/$/, "")
    : "http://localhost:3000";
}
