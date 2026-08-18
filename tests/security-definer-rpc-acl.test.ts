import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260818112729_global_security_definer_acl_hardening.sql",
  "utf8",
);

function grantsFor(role: "authenticated" | "service_role"): string[] {
  return [...migration.matchAll(
    new RegExp(`grant execute on function ([^;]+) to ${role};`, "g"),
  )]
    .map((match) => match[1].trim())
    .sort();
}

const authenticatedAllowlist = [
  "public.assign_next_lesson()",
  "public.complete_lesson_session(uuid, integer, integer, integer, jsonb)",
  "public.complete_onboarding(text, text, public.jlpt_level, integer, text)",
  "public.create_lesson_tts_batch(integer, text)",
  "public.current_app_role()",
  "public.get_learner_progress_summary()",
  "public.has_app_role(public.app_role[])",
  "public.import_complete_lessons(jsonb, boolean)",
  "public.publish_lesson_version(uuid, text)",
  "public.record_mastery_evidence(uuid, jsonb)",
  "public.reset_learner_progress(uuid)",
  "public.save_lesson_draft(text, jsonb)",
].sort();

const serviceRoleAllowlist = [
  "public.claim_custom_lesson_stage(uuid)",
  "public.claim_progressive_lesson_audio_job(uuid)",
  "public.claim_progressive_lesson_job(uuid)",
  "public.create_lesson_tts_batch(integer, text)",
  "public.custom_lesson_scheduler_diagnostics()",
  "public.enrich_custom_lesson_placeholders_background(uuid, jsonb, jsonb, text)",
  "public.invalidate_progressive_lesson_group(uuid, uuid, text, text)",
  "public.invoke_custom_lesson_worker()",
  "public.learn_grammar_pattern_alias(text, text, numeric)",
  "public.record_story_kanji_exposures_background(uuid, jsonb)",
  "public.reserve_lesson_generation_kanji_set(public.jlpt_level, text[], uuid, text)",
  "public.save_progressive_lesson_group(uuid, uuid, text, jsonb, jsonb)",
  "public.store_generated_lesson_package_background(uuid, jsonb, integer)",
  "public.store_generated_lesson_package_background_base(uuid, jsonb, integer)",
  "public.store_generated_lesson_package_background_listening_base(uuid, jsonb, integer)",
  "public.store_generated_lesson_package_background_package_base(uuid, jsonb, integer)",
  "public.store_generated_lesson_package_background_reading_base(uuid, jsonb, integer)",
  "public.store_generated_lesson_package_background_reading_mcq_base(uuid, jsonb, integer)",
  "public.store_story_vocabulary_enrichment(uuid, public.jlpt_level, jsonb, text)",
].sort();

describe("SECURITY DEFINER RPC privilege hardening", () => {
  it("removes broad current and future function execution defaults", () => {
    expect(migration).toContain("alter default privileges in schema public");
    expect(migration).toContain(
      "revoke execute on functions from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("and p.prosecdef");
    expect(migration).toContain(
      "revoke execute on function %s from public, anon, authenticated, service_role",
    );
    expect(migration).not.toMatch(/grant execute on function [^;]+ to anon;/);
  });

  it("keeps authenticated execution on only the reviewed learner/admin allowlist", () => {
    expect(grantsFor("authenticated")).toEqual(authenticatedAllowlist);
  });

  it("keeps service-role execution on only the reviewed worker/internal allowlist", () => {
    expect(grantsFor("service_role")).toEqual(serviceRoleAllowlist);
  });

  it("fixes NULL-safe ownership authorization for learner progress reset", () => {
    expect(migration).toContain("create or replace function public.reset_learner_progress");
    expect(migration).toContain("if auth.uid() is null then");
    expect(migration).toContain("auth.uid() is distinct from p_user_id");
    expect(migration).toContain(
      "public.has_app_role(array['admin']::public.app_role[])",
    );
    expect(migration).not.toContain("auth.uid() <> p_user_id");
  });

  it("protects direct mastery-profile synchronization without breaking its trigger path", () => {
    expect(migration).toContain(
      "create or replace function public.sync_level_scoped_mastery_profile",
    );
    expect(migration).toContain("if pg_trigger_depth() = 0");
    expect(migration).toContain("auth.uid() is distinct from p_user_id");
    expect(authenticatedAllowlist).not.toContain(
      "public.sync_level_scoped_mastery_profile(uuid, public.jlpt_level)",
    );
    expect(serviceRoleAllowlist).not.toContain(
      "public.sync_level_scoped_mastery_profile(uuid, public.jlpt_level)",
    );
  });

  it("requires cron postgres or service role inside Vault-backed scheduler functions", () => {
    expect(
      migration.match(/session_user <> 'postgres'/g) ?? [],
    ).toHaveLength(4);
    expect(
      migration.match(/coalesce\(auth\.role\(\), ''\) <> 'service_role'/g) ?? [],
    ).toHaveLength(4);
    expect(migration).toContain(
      "grant execute on function public.invoke_custom_lesson_worker() to service_role;",
    );
    expect(migration).not.toContain(
      "grant execute on function public.invoke_custom_lesson_worker() to authenticated;",
    );
  });

  it("does not preserve retired direct generation/review compatibility RPC exposure", () => {
    const externalGrants = [
      ...grantsFor("authenticated"),
      ...grantsFor("service_role"),
    ].join("\n");
    for (const retired of [
      "begin_custom_lesson_generation_v2",
      "begin_custom_lesson_generation_v3",
      "begin_custom_lesson_generation_v4",
      "claim_review_reward",
      "complete_review_session",
      "import_legacy_progress",
      "record_story_kanji_exposures(",
      "store_generated_lesson_package_v2",
    ]) {
      expect(externalGrants).not.toContain(retired);
    }
  });
});
