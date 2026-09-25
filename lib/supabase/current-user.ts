"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * The signed-in learner's id, without a round trip.
 *
 * getUser() asks the auth server to validate the token every time it is
 * called, and finishing one section called it three times — once to load the
 * lesson, once to stamp the answers, once to stamp the events — before any of
 * the actual work started. On a phone that is most of the wait.
 *
 * Reading it from the session the browser already holds proves nothing less.
 * The id is only used to fill in user_id on rows the database then checks
 * against auth.uid() itself, so a stale or wrong one is refused by RLS rather
 * than written. getSession also renews an expired token on the way past, which
 * is the only thing getUser was really buying here.
 */
export async function currentUserId(
  client: SupabaseClient<Database>,
): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}
