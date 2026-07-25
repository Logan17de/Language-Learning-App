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
  // OAuth and email-auth actions begin in the browser, so the current origin is
  // the authoritative callback host. This also prevents a stale development
  // NEXT_PUBLIC_APP_URL from sending a deployed user back to localhost.
  if (typeof window !== "undefined") return window.location.origin;

  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configuredUrl) return configuredUrl;

  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  return vercelUrl
    ? "https://" + vercelUrl.replace(/\/$/, "")
    : "http://localhost:3000";
}
