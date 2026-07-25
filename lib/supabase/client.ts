"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

const GOOGLE_OAUTH_STORAGE_KEY = "aiko-google-oauth";
let browserClient: SupabaseClient<Database> | null | undefined;
let googleOAuthClient: SupabaseClient<Database> | null | undefined;

export function createClient(): SupabaseClient<Database> | null {
  if (browserClient !== undefined) return browserClient;
  const config = getSupabasePublicConfig();
  browserClient = config
    ? createBrowserClient<Database>(config.url, config.anonKey)
    : null;
  return browserClient;
}

export function createGoogleOAuthClient(): SupabaseClient<Database> | null {
  if (googleOAuthClient !== undefined) return googleOAuthClient;
  const config = getSupabasePublicConfig();
  if (!config || typeof window === "undefined") {
    googleOAuthClient = null;
    return googleOAuthClient;
  }

  googleOAuthClient = createSupabaseClient<Database>(
    config.url,
    config.anonKey,
    {
      auth: {
        flowType: "pkce",
        storage: window.localStorage,
        storageKey: GOOGLE_OAUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return googleOAuthClient;
}

export function clearGoogleOAuthStorage(): void {
  if (typeof window === "undefined") return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(GOOGLE_OAUTH_STORAGE_KEY)) {
      window.localStorage.removeItem(key);
    }
  }
}
