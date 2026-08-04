// Generated-compatible Supabase Database shape.
// Regenerate from a running local stack with: npm run db:types

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableDef<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type ProfileRow = Timestamps & {
  id: string;
  display_name: string;
  email: string;
  current_jlpt_level: Database["public"]["Enums"]["jlpt_level"];
  learning_goal: string | null;
  daily_study_minutes: number;
  interests: string[];
  subscription_plan: Database["public"]["Enums"]["subscription_plan"];
  role: Database["public"]["Enums"]["app_role"];
  status: Database["public"]["Enums"]["account_status"];
  timezone: string;
  xp: number;
  streak_days: number;
  longest_streak: number;
  total_study_minutes: number;
  legacy_imported_at: string | null;
};

export type LessonRow = Timestamps & {
  id: string;
  legacy_id: string | null;
  slug: string;
  title: string;
  japanese_title: string;
  summary: string;
  topic: string;
  jlpt_level: Database["public"]["Enums"]["jlpt_level"];
  duration_minutes: number;
  status: Database["public"]["Enums"]["lesson_status"];
  source: string;
  source_lesson_id: string | null;
  current_version_id: string | null;
  tags: string[];
  published_at: string | null;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  generated_for_user_id: string | null;
  normalized_topic: string;
  content_signature: string | null;
  reusable: boolean;
  usage_count: number;
  last_assigned_at: string | null;
};

export type LessonVersionRow = Timestamps & {
  id: string;
  lesson_id: string;
  version_number: number;
  status: Database["public"]["Enums"]["lesson_status"];
  change_summary: string;
  schema_version: number;
  answer_keys: string[];
  review_items: string[];
  phases: Json;
  metadata: Json;
  published_at: string | null;
  created_by: string | null;
};

type LibraryMetadata = {
  source_type: "legacy" | "curated" | "imported" | "ai_enriched";
  source_model: string | null;
  quality_status: "usable" | "needs_review" | "verified" | "rejected";
  source_payload: Json;
  usage_count: number;
  last_used_at: string | null;
};

type ContentRow = Timestamps & {
  id: string;
  lesson_version_id: string;
  position: number;
};

type ActivityRow = ContentRow & {
  prompt: string;
  explanation: string;
};

type OwnedRow = Timestamps & {
  id: string;
  user_id: string;
};

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow>;
      user_preferences: TableDef<OwnedRow & { learning_goal: string | null; daily_study_minutes: number; interests: string[]; onboarding_complete: boolean }>;
      user_settings: TableDef<OwnedRow & { settings: Json }>;
      user_subscriptions: TableDef<OwnedRow & { plan: Database["public"]["Enums"]["subscription_plan"]; status: Database["public"]["Enums"]["subscription_status"]; billing_interval: string | null; starts_at: string; renews_at: string | null; cancelled_at: string | null; mock_payment_status: string }>;
      curriculum_levels: TableDef<Timestamps & { id: string; jlpt_level: Database["public"]["Enums"]["jlpt_level"]; title: string; description: string; sequence_order: number }>;
      curriculum_items: TableDef<Timestamps & { id: string; curriculum_level_id: string; item_type: string; label: string; sequence_order: number; required: boolean; prerequisite_ids: string[]; archived_at: string | null }>;
      grammar_catalog: TableDef<Timestamps & { id: string; pattern: string; jlpt_level: Database["public"]["Enums"]["jlpt_level"]; source_order: number; active: boolean; accepted_patterns: string[] }>;
      grammar_records: TableDef<Timestamps & LibraryMetadata & { id: string; legacy_id: string | null; pattern: string; jlpt_level: Database["public"]["Enums"]["jlpt_level"]; meaning: string; formation: string; usage_notes: string; nuance: string; example_sentences: string[]; common_mistakes: string[]; prerequisite_ids: string[]; similar_grammar_ids: string[]; contrast_grammar_ids: string[]; archived_at: string | null }>;
      kanji_catalog: TableDef<Timestamps & { id: string; character: string; jlpt_level: Database["public"]["Enums"]["jlpt_level"]; source_order: number; active: boolean }>;
      kanji_records: TableDef<Timestamps & LibraryMetadata & { id: string; legacy_id: string | null; character: string; jlpt_level: Database["public"]["Enums"]["jlpt_level"]; meanings: string[]; readings: string[]; onyomi: string[]; kunyomi: string[]; example_words: string[]; stroke_count: number; prerequisite_kanji: string[]; archived_at: string | null }>;
      kana_records: TableDef<Timestamps & { id: string; value: string; normalized_value: string; script_type: "hiragana" | "katakana" | "mixed"; usage_count: number }>;
      vocabulary_records: TableDef<Timestamps & LibraryMetadata & { id: string; legacy_id: string | null; written_form: string; reading: string; kana_id: string; meaning: string; part_of_speech: string; jlpt_level: Database["public"]["Enums"]["jlpt_level"]; tags: string[]; example_sentence: string; linked_kanji_ids: string[]; archived_at: string | null }>;
      story_vocabulary_enrichments: TableDef<{ id: string; request_id: string; user_id: string; vocabulary_id: string; position: number; word: string; reading: string; meaning: string; source_model: string | null; created_at: string }>;
      lessons: TableDef<LessonRow>;
      lesson_versions: TableDef<LessonVersionRow>;
      lesson_story_lines: TableDef<ContentRow & { japanese_text: string; translation: string; tappable_terms: string[]; image_asset_id: string | null; audio_asset_id: string | null }>;
      lesson_story_words: TableDef<ContentRow & { story_line_id: string; surface: string; reading: string; meaning: string; script_type: "kanji" | "hiragana" | "katakana"; meaning_score: number; recognition_score: number; pronunciation_score: number; library_id: string | null; library_type: "kanji" | "vocabulary" | null }>;
      lesson_vocabulary: TableDef<ContentRow & { vocabulary_id: string | null; written_form: string; reading: string; meaning: string; part_of_speech: string; example_sentence: string | null }>;
      lesson_grammar: TableDef<ContentRow & { grammar_id: string | null; pattern: string; meaning: string; structure: string; usage_notes: string; example: string; translation: string; common_mistake: string }>;
      lesson_practice_activities: TableDef<ContentRow & { phase: "vocabulary" | "grammar"; activity_type: "multiple_choice" | "word_order" | "matching" | "text_input"; difficulty: "Easy" | "Medium" | "Hard"; mode: string; skill: "understanding" | "production"; prompt: string; cue: string; choices: string[]; correct_answer: string; accepted_answers: string[]; explanation: string; hint_front: string; hint_back: string; target_item_ids: string[]; inspectable_terms: Json }>;
      lesson_reading_sections: TableDef<ContentRow & { speaker: string; japanese_text: string; translation: string; tappable_terms: string[]; inspectable_terms: Json; target_item_ids: string[] }>;
      lesson_reading_questions: TableDef<ContentRow & { difficulty: "easy" | "medium" | "hard"; question: string; answer: string }>;
      lesson_listening_activities: TableDef<ActivityRow & { difficulty: "easy" | "medium" | "hard"; transcript: string; conversation_lines: string[]; choices: string[]; correct_answer: string; audio_asset_id: string | null; inspectable_terms: Json; target_item_ids: string[] }>;
      lesson_speaking_activities: TableDef<ContentRow & { mode: string; question_type: "direct_information" | "sequence_of_events" | "speaker_intention" | "reason_or_purpose" | "simple_inference"; prompt: string; easy_prompt: string | null; medium_prompt: string | null; hard_prompt: string | null; expected_answer: string | null; model_answer: string; expected_concepts: string[]; semantic_criteria: string[]; inspectable_terms: Json; target_item_ids: string[] }>;
      lesson_review_activities: TableDef<ActivityRow & { question_type: string; choices: string[]; correct_answer: string; category: string; target_item_ids: string[] }>;
      lesson_assets: TableDef<Timestamps & { id: string; lesson_version_id: string; asset_type: string; image_asset_id: string | null; audio_asset_id: string | null; position: number }>;
      image_assets: TableDef<Timestamps & { id: string; legacy_id: string | null; storage_path: string; description: string; topic_tags: string[]; visible_objects: string[]; vocabulary_tags: string[]; grammar_compatibility: string[]; jlpt_level: Database["public"]["Enums"]["jlpt_level"]; quality_score: number; creation_source: string; status: string; archived_at: string | null }>;
      audio_assets: TableDef<Timestamps & { id: string; legacy_id: string | null; storage_path: string; japanese_text: string; voice: string; speaking_style: string; duration_seconds: number; playback_speed: number; status: string; archived_at: string | null }>;
      lesson_sessions: TableDef<OwnedRow & { lesson_id: string; lesson_version_id: string; status: Database["public"]["Enums"]["session_status"]; current_phase: string; current_phase_index: number; activity_index: number; elapsed_seconds: number; checkpoint: Json; started_at: string; completed_at: string | null; last_saved_at: string; reward_claimed_at: string | null }>;
      lesson_activity_answers: TableDef<OwnedRow & { lesson_session_id: string; phase: string; activity_id: string; selected_answer: string; correct: boolean; attempts: number; answer_data: Json }>;
      lesson_events: TableDef<OwnedRow & { lesson_session_id: string; client_event_id: string; phase: string; event_type: string; event_data: Json; occurred_at: string }>;
      lesson_completions: TableDef<OwnedRow & { lesson_id: string; lesson_version_id: string; lesson_session_id: string; score: number; xp_awarded: number; duration_minutes: number; completion_data: Json; completed_at: string }>;
      lesson_assignments: TableDef<Timestamps & { id: string; user_id: string; lesson_id: string; lesson_version_id: string; selection_mode: "free_random" | "pro_interest" | "pro_custom"; status: "assigned" | "started" | "completed"; algorithm_version: string; interest_matches: string[]; assigned_at: string; started_at: string | null; completed_at: string | null }>;
      learner_mastery: TableDef<OwnedRow & { item_type: string; item_key: string; mastery: number; confidence: number; last_reviewed_at: string | null; next_review_at: string | null; evidence_count: number; meaning_score: number; recognition_score: number; pronunciation_score: number }>;
      learner_mastery_events: TableDef<{ id: string; user_id: string; lesson_id: string | null; lesson_version_id: string | null; lesson_session_id: string | null; client_event_id: string; item_type: "kanji" | "vocabulary" | "grammar"; item_key: string; dimension: "meaning" | "recognition" | "pronunciation"; signal: "exposure" | "revealed_reading" | "revealed_meaning" | "correct" | "incorrect" | "pronunciation_correct" | "pronunciation_incorrect"; score_delta: number; event_data: Json; occurred_at: string; created_at: string }>;
      review_queue: TableDef<OwnedRow & { item_type: string; item_key: string; prompt_data: Json; due_at: string; confidence: number; reason: string; status: string }>;
      review_sessions: TableDef<OwnedRow & { status: Database["public"]["Enums"]["session_status"]; started_at: string; completed_at: string | null; score: number | null; xp_awarded: number; reward_claimed_at: string | null }>;
      review_activity_answers: TableDef<OwnedRow & { review_session_id: string; review_queue_id: string | null; activity_id: string; activity_type: string; selected_answer: string; correct: boolean; answer_data: Json }>;
      review_results: TableDef<OwnedRow & { review_session_id: string; score: number; correct_count: number; total_count: number; improved_item_ids: string[]; weak_item_ids: string[]; xp_awarded: number; completed_at: string }>;
      achievements: TableDef<Timestamps & { id: string; key: string; title: string; description: string; target: number; active: boolean }>;
      user_achievements: TableDef<OwnedRow & { achievement_id: string; progress: number; earned_at: string | null }>;
      weekly_activity: TableDef<OwnedRow & { activity_date: string; minutes: number; lesson_minutes: number; review_minutes: number }>;
      custom_lesson_requests: TableDef<OwnedRow & { topic: string; jlpt_level: Database["public"]["Enums"]["jlpt_level"]; duration_minutes: number; focus: string; speaking_difficulty: string; note: string; status: Database["public"]["Enums"]["custom_request_status"]; matched_lesson_id: string | null; generated_lesson_id: string | null }>;
      generated_lesson_jobs: TableDef<Timestamps & { id: string; custom_lesson_request_id: string; lesson_id: string | null; status: string; source_lesson_id: string | null; generation_seconds: number | null; error_message: string | null; created_by: string }>;
      lesson_validation_runs: TableDef<Timestamps & { id: string; lesson_id: string; lesson_version_id: string | null; status: string; score: number; warnings: string[]; validated_by: string | null; completed_at: string | null }>;
      lesson_validation_checks: TableDef<Timestamps & { id: string; validation_run_id: string; category: string; check_key: string; label: string; severity: string; detail: string }>;
      lesson_reports: TableDef<OwnedRow & { lesson_id: string; lesson_version_id: string | null; phase: string | null; activity_id: string | null; category: string; description: string; user_answer: string | null; route: string; priority: string; status: string; assigned_to: string | null; submitted_at: string }>;
      support_tickets: TableDef<OwnedRow & { category: string; subject: string; status: string; priority: string; assigned_to: string | null; last_message_at: string }>;
      support_messages: TableDef<OwnedRow & { support_ticket_id: string; author_id: string; author_role: Database["public"]["Enums"]["app_role"]; message: string; internal: boolean }>;
      audit_logs: TableDef<Timestamps & { id: string; actor_user_id: string; action: string; entity_type: string; entity_id: string; before_summary: Json | null; after_summary: Json | null; metadata: Json }>;
      feature_flags: TableDef<Timestamps & { id: string; key: string; enabled: boolean; public: boolean; description: string }>;
      service_status: TableDef<Timestamps & { id: string; service_name: string; status: string; detail: string }>;
      cost_records: TableDef<Timestamps & { id: string; category: string; record_date: string; amount: number; unit: string; units: number; metadata: Json }>;
      reward_ledger: TableDef<Timestamps & { id: string; user_id: string; reward_type: string; source_id: string; xp_awarded: number; canonical_result: Json }>;
    };
    Views: {
      learner_progress_summary: {
        Row: { user_id: string; xp: number; streak_days: number; longest_streak: number; total_study_minutes: number; completed_lessons: number; average_lesson_score: number };
        Relationships: [];
      };
      learner_weekly_activity: {
        Row: { user_id: string; activity_date: string; minutes: number; lesson_minutes: number; review_minutes: number };
        Relationships: [];
      };
      learner_weak_items: {
        Row: { user_id: string; item_type: string; item_key: string; mastery: number; confidence: number };
        Relationships: [];
      };
      lesson_performance_summary: {
        Row: { lesson_id: string; completion_count: number; average_score: number; average_duration_minutes: number };
        Relationships: [];
      };
      admin_dashboard_summary: {
        Row: { total_users: number; daily_active_users: number; premium_users: number; published_lessons: number; pending_validations: number; open_reports: number; open_support_tickets: number };
        Relationships: [];
      };
    };
    Functions: {
      complete_lesson_session: {
        Args: { p_session_id: string; p_score: number; p_xp: number; p_duration_minutes: number; p_completion_data: Json };
        Returns: Json;
      };
      claim_lesson_reward: {
        Args: { p_session_id: string };
        Returns: Json;
      };
      complete_review_session: {
        Args: { p_session_id: string; p_score: number; p_correct_count: number; p_total_count: number; p_improved_item_ids: string[]; p_weak_item_ids: string[]; p_xp: number };
        Returns: Json;
      };
      claim_review_reward: {
        Args: { p_session_id: string };
        Returns: Json;
      };
      reset_learner_progress: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      publish_lesson_version: {
        Args: { p_lesson_id: string; p_change_summary: string };
        Returns: Json;
      };
      import_legacy_progress: {
        Args: { p_payload: Json };
        Returns: Json;
      };
      save_lesson_draft: {
        Args: { p_lesson_ref: string; p_package: Json };
        Returns: Json;
      };
      import_complete_lesson: {
        Args: { p_package: Json; p_publish?: boolean };
        Returns: Json;
      };
      current_app_role: {
        Args: Record<string, never>;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      assign_next_lesson: {
        Args: Record<string, never>;
        Returns: Json;
      };
      begin_custom_lesson_generation: {
        Args: { p_topic: string; p_duration_minutes: number; p_focus: string; p_speaking_difficulty: string; p_note: string };
        Returns: Json;
      };
      begin_custom_lesson_generation_v2: {
        Args: { p_topic: string; p_level: Database["public"]["Enums"]["jlpt_level"] };
        Returns: Json;
      };
      begin_custom_lesson_generation_v3: {
        Args: { p_topic: string; p_level: Database["public"]["Enums"]["jlpt_level"] };
        Returns: Json;
      };
      enrich_custom_lesson_library: {
        Args: { p_level: Database["public"]["Enums"]["jlpt_level"]; p_seed: Json };
        Returns: Json;
      };
      enrich_custom_lesson_library_v2: {
        Args: { p_level: Database["public"]["Enums"]["jlpt_level"]; p_seed: Json; p_source_model: string };
        Returns: Json;
      };
      store_story_vocabulary_enrichment: {
        Args: { p_request_id: string; p_level: Database["public"]["Enums"]["jlpt_level"]; p_vocabulary: Json; p_source_model: string };
        Returns: Json;
      };
      learn_grammar_pattern_alias: {
        Args: { p_canonical_pattern: string; p_alias: string; p_confidence: number };
        Returns: boolean;
      };
      get_learner_progress_summary: {
        Args: Record<string, never>;
        Returns: Json;
      };
      record_mastery_evidence: {
        Args: { p_session_id: string; p_events: Json };
        Returns: Json;
      };
      store_generated_lesson_package: {
        Args: { p_request_id: string; p_package: Json; p_generation_seconds: number };
        Returns: Json;
      };
      store_generated_lesson_package_v2: {
        Args: { p_request_id: string; p_package: Json; p_generation_seconds: number };
        Returns: Json;
      };
      attach_generated_lesson_package: {
        Args: { p_request_id: string; p_lesson_version_id: string; p_generation_package: Json };
        Returns: boolean;
      };
      fail_custom_lesson_generation: {
        Args: { p_request_id: string; p_error: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "learner" | "admin" | "content_editor" | "support";
      account_status: "active" | "suspended" | "deleted";
      jlpt_level: "N5" | "N4" | "N3" | "N2" | "N1";
      lesson_status: "draft" | "generated" | "checking" | "needs_review" | "approved" | "published" | "rejected" | "archived";
      session_status: "active" | "completed" | "abandoned";
      subscription_plan: "free" | "premium_monthly" | "premium_annual";
      subscription_status: "active" | "trial" | "cancelled" | "past_due";
      custom_request_status: "requested" | "matching" | "matched" | "generation_pending" | "generated" | "validation_pending" | "approved" | "failed";
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
