import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database } from "@/types/database";

type Audit = Database["public"]["Tables"]["audit_logs"]["Row"];

export const adminOperationsRepository = {
  async listAudit(): Promise<RepositoryResult<Audit[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(250);
    return error ? failure(error, "Audit entries could not be loaded.") : success(data ?? []);
  },

  async listServiceStatus(): Promise<RepositoryResult<Database["public"]["Tables"]["service_status"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("service_status").select("*").order("service_name");
    return error ? failure(error, "Service status could not be loaded.") : success(data ?? []);
  },

  async listReports(): Promise<RepositoryResult<Database["public"]["Tables"]["lesson_reports"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("lesson_reports").select("*").order("submitted_at", { ascending: false });
    return error ? failure(error, "Lesson reports could not be loaded.") : success(data ?? []);
  },

  async listSupportTickets(): Promise<RepositoryResult<Database["public"]["Tables"]["support_tickets"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("support_tickets").select("*").order("last_message_at", { ascending: false });
    return error ? failure(error, "Support tickets could not be loaded.") : success(data ?? []);
  },

  async listSubscriptions(): Promise<RepositoryResult<Database["public"]["Tables"]["user_subscriptions"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("user_subscriptions").select("*").order("created_at", { ascending: false });
    return error ? failure(error, "Subscriptions could not be loaded.") : success(data ?? []);
  },

  async listCurriculum(): Promise<RepositoryResult<Database["public"]["Tables"]["curriculum_items"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("curriculum_items").select("*").is("archived_at", null).order("sequence_order");
    return error ? failure(error, "Curriculum could not be loaded.") : success(data ?? []);
  },

  async listGrammar(): Promise<RepositoryResult<Database["public"]["Tables"]["grammar_records"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("grammar_records").select("*").is("archived_at", null).order("jlpt_level");
    return error ? failure(error, "Grammar records could not be loaded.") : success(data ?? []);
  },

  async listKanji(): Promise<RepositoryResult<Database["public"]["Tables"]["kanji_records"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("kanji_records").select("*").is("archived_at", null).order("jlpt_level");
    return error ? failure(error, "Kanji records could not be loaded.") : success(data ?? []);
  },

  async listVocabulary(): Promise<RepositoryResult<Database["public"]["Tables"]["vocabulary_records"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("vocabulary_records").select("*").is("archived_at", null).order("jlpt_level");
    return error ? failure(error, "Vocabulary records could not be loaded.") : success(data ?? []);
  },

  async listImages(): Promise<RepositoryResult<Database["public"]["Tables"]["image_assets"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("image_assets").select("*").is("archived_at", null).order("created_at", { ascending: false });
    return error ? failure(error, "Image assets could not be loaded.") : success(data ?? []);
  },

  async listAudio(): Promise<RepositoryResult<Database["public"]["Tables"]["audio_assets"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("audio_assets").select("*").is("archived_at", null).order("created_at", { ascending: false });
    return error ? failure(error, "Audio assets could not be loaded.") : success(data ?? []);
  },

  async listGeneratedJobs(): Promise<RepositoryResult<Database["public"]["Tables"]["generated_lesson_jobs"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("generated_lesson_jobs").select("*").order("created_at", { ascending: false });
    return error ? failure(error, "Generated jobs could not be loaded.") : success(data ?? []);
  },

  async listValidationRuns(): Promise<RepositoryResult<Database["public"]["Tables"]["lesson_validation_runs"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("lesson_validation_runs").select("*").order("created_at", { ascending: false });
    return error ? failure(error, "Validation results could not be loaded.") : success(data ?? []);
  },

  async listFeatureFlags(): Promise<RepositoryResult<Database["public"]["Tables"]["feature_flags"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("feature_flags").select("*").order("key");
    return error ? failure(error, "Feature flags could not be loaded.") : success(data ?? []);
  },

  async listCosts(): Promise<RepositoryResult<Database["public"]["Tables"]["cost_records"]["Row"][]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("cost_records").select("*").order("record_date", { ascending: false });
    return error ? failure(error, "Cost records could not be loaded.") : success(data ?? []);
  },
};
