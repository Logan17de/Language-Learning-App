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
    anonKey.includes("your-")
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
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configuredUrl) return configuredUrl;

  if (typeof window !== "undefined") return window.location.origin;

  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  return vercelUrl
    ? "https://" + vercelUrl.replace(/\/$/, "")
    : "http://localhost:3000";
}
