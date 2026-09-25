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
  // AIko uses one auth origin only. Local, preview, and generated Vercel
  // hostnames must never become OAuth, confirmation, or password-reset targets.
  return AIKO_CANONICAL_ORIGIN;
}
