import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type { Database } from "@/types/database";
import { isUuid } from "@/lib/identifiers";

type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
type Version = Database["public"]["Tables"]["lesson_versions"]["Row"];

export interface CanonicalLesson {
  lesson: Lesson;
  version: Version;
  story: Database["public"]["Tables"]["lesson_story_lines"]["Row"][];
  storyWords: Database["public"]["Tables"]["lesson_story_words"]["Row"][];
  vocabulary: Database["public"]["Tables"]["lesson_vocabulary"]["Row"][];
  grammar: Database["public"]["Tables"]["lesson_grammar"]["Row"][];
  practice: Database["public"]["Tables"]["lesson_practice_activities"]["Row"][];
  reading: Database["public"]["Tables"]["lesson_reading_sections"]["Row"][];
  readingQuestions: Database["public"]["Tables"]["lesson_reading_questions"]["Row"][];
  listening: Database["public"]["Tables"]["lesson_listening_activities"]["Row"][];
  speaking: Database["public"]["Tables"]["lesson_speaking_activities"]["Row"][];
  /** Server-backed profile access. Locked payloads never contain Premium activities. */
  premiumPhaseAccess: "full" | "locked";
  /** Learner-specific kanji with at least ten recorded story appearances. */
  knownKanji: string[];
}

async function loadContent(
  lesson: Lesson,
  version: Version,
): Promise<RepositoryResult<CanonicalLesson>> {
  const client = createClient();
  if (!client) return notConfigured();
  const rawClient = client as unknown as SupabaseClient;
  const versionId = version.id;

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) {
    return failure(authError ?? { code: "AUTH" }, "Your session has expired.");
  }
  const profile = await client
    .from("profiles")
    .select("subscription_plan,role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profile.error || !profile.data) {
    return failure(profile.error, "Your lesson access could not be verified.");
  }
  const premiumPhaseAccess: CanonicalLesson["premiumPhaseAccess"] =
    profile.data.subscription_plan !== "free" ||
    profile.data.role === "admin" ||
    profile.data.role === "content_editor"
      ? "full"
      : "locked";

  const listeningPromise =
    premiumPhaseAccess === "full"
      ? client
          .from("lesson_listening_activities")
          .select("*")
          .eq("lesson_version_id", versionId)
          .order("position")
      : Promise.resolve({
          data: [] as CanonicalLesson["listening"],
          error: null,
        });
  const speakingPromise =
    premiumPhaseAccess === "full"
      ? client
          .from("lesson_speaking_activities")
          .select("*")
          .eq("lesson_version_id", versionId)
          .order("position")
      : Promise.resolve({
          data: [] as CanonicalLesson["speaking"],
          error: null,
        });

  const [
    story,
    storyWords,
    vocabulary,
    grammar,
    practice,
    reading,
    readingQuestions,
    listening,
    speaking,
    knownKanji,
  ] = await Promise.all([
    client
      .from("lesson_story_lines")
      .select("*")
      .eq("lesson_version_id", versionId)
      .order("position"),
    client
      .from("lesson_story_words")
      .select("*")
      .eq("lesson_version_id", versionId)
      .order("story_line_id")
      .order("position"),
    client
      .from("lesson_vocabulary")
      .select("*")
      .eq("lesson_version_id", versionId)
      .order("position"),
    client
      .from("lesson_grammar")
      .select("*")
      .eq("lesson_version_id", versionId)
      .order("position"),
    client
      .from("lesson_practice_activities")
      .select("*")
      .eq("lesson_version_id", versionId)
      .order("phase")
      .order("position"),
    client
      .from("lesson_reading_sections")
      .select("*")
      .eq("lesson_version_id", versionId)
      .order("position"),
    client
      .from("lesson_reading_questions")
      .select("*")
      .eq("lesson_version_id", versionId)
      .order("position"),
    listeningPromise,
    speakingPromise,
    rawClient
      .from("learner_kanji_exposure_progress")
      .select("character,appearance_count")
      .gte("appearance_count", 10),
  ]);
  const storyWordTableMissing =
    storyWords.error?.code === "42P01" ||
    storyWords.error?.code === "PGRST205" ||
    storyWords.error?.message?.includes("lesson_story_words") === true;
  const readingQuestionTableMissing =
    readingQuestions.error?.code === "42P01" ||
    readingQuestions.error?.code === "PGRST205" ||
    readingQuestions.error?.message?.includes("lesson_reading_questions") === true;
  const firstError = [
    story,
    vocabulary,
    grammar,
    practice,
    reading,
    listening,
    speaking,
    knownKanji,
    ...(readingQuestionTableMissing ? [] : [readingQuestions]),
    ...(storyWordTableMissing ? [] : [storyWords]),
  ].find((result) => result.error)?.error;
  if (firstError) {
    return failure(firstError, "Lesson content could not be loaded.");
  }
  return success({
    lesson,
    version,
    story: story.data ?? [],
    storyWords: storyWordTableMissing ? [] : (storyWords.data ?? []),
    vocabulary: vocabulary.data ?? [],
    grammar: grammar.data ?? [],
    practice: practice.data ?? [],
    reading: reading.data ?? [],
    readingQuestions: readingQuestionTableMissing ? [] : (readingQuestions.data ?? []),
    listening: listening.data ?? [],
    speaking: speaking.data ?? [],
    premiumPhaseAccess,
    knownKanji: (knownKanji.data ?? []).flatMap((row) =>
      typeof row.character === "string" ? [row.character] : [],
    ),
  });
}

export const lessonRepository = {
  async listPublished(): Promise<RepositoryResult<Lesson[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client
      .from("lessons")
      .select("*")
      .eq("status", "published")
      .is("archived_at", null)
      .order("published_at", { ascending: false });
    return error
      ? failure(error, "Lessons could not be loaded.")
      : success(data ?? []);
  },

  async getPublished(
    idOrLegacyId: string,
  ): Promise<RepositoryResult<CanonicalLesson>> {
    const client = createClient();
    if (!client) return notConfigured();
    const byId = isUuid(idOrLegacyId)
      ? await client
          .from("lessons")
          .select("*")
          .eq("id", idOrLegacyId)
          .eq("status", "published")
          .maybeSingle()
      : null;
    const lessonResult = byId?.data
      ? byId
      : await client
          .from("lessons")
          .select("*")
          .eq("legacy_id", idOrLegacyId)
          .eq("status", "published")
          .maybeSingle();
    if (lessonResult.error) {
      return failure(lessonResult.error, "Lesson could not be loaded.");
    }
    if (!lessonResult.data?.current_version_id) {
      return failure({ code: "PGRST116" }, "This lesson is unavailable.");
    }
    const versionResult = await client
      .from("lesson_versions")
      .select("*")
      .eq("id", lessonResult.data.current_version_id)
      .single();
    if (versionResult.error) {
      return failure(
        versionResult.error,
        "The current lesson version could not be loaded.",
      );
    }
    return loadContent(lessonResult.data, versionResult.data);
  },

  async getPlayable(
    idOrLegacyId: string,
  ): Promise<RepositoryResult<CanonicalLesson>> {
    const client = createClient();
    if (!client) return notConfigured();
    const byId = isUuid(idOrLegacyId)
      ? await client
          .from("lessons")
          .select("*")
          .eq("id", idOrLegacyId)
          .maybeSingle()
      : null;
    const lessonResult = byId?.data
      ? byId
      : await client
          .from("lessons")
          .select("*")
          .eq("legacy_id", idOrLegacyId)
          .maybeSingle();
    if (lessonResult.error) {
      return failure(lessonResult.error, "Lesson could not be loaded.");
    }
    if (!lessonResult.data) {
      return failure({ code: "PGRST116" }, "This lesson is unavailable.");
    }
    const active = await client
      .from("lesson_sessions")
      .select("lesson_version_id")
      .eq("lesson_id", lessonResult.data.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active.error) {
      return failure(active.error, "Your saved lesson could not be loaded.");
    }
    const versionId =
      active.data?.lesson_version_id ??
      (lessonResult.data.status === "published"
        ? lessonResult.data.current_version_id
        : null);
    if (!versionId) {
      return failure({ code: "PGRST116" }, "This lesson is not published.");
    }
    const version = await client
      .from("lesson_versions")
      .select("*")
      .eq("id", versionId)
      .single();
    if (version.error) {
      return failure(version.error, "The lesson version could not be loaded.");
    }
    return loadContent(lessonResult.data, version.data);
  },

  async getVersionForSession(
    lessonId: string,
    versionId: string,
  ): Promise<RepositoryResult<CanonicalLesson>> {
    const client = createClient();
    if (!client) return notConfigured();
    const [lesson, version] = await Promise.all([
      client.from("lessons").select("*").eq("id", lessonId).single(),
      client
        .from("lesson_versions")
        .select("*")
        .eq("id", versionId)
        .eq("lesson_id", lessonId)
        .single(),
    ]);
    if (lesson.error || version.error) {
      return failure(
        lesson.error ?? version.error,
        "The saved lesson version could not be loaded.",
      );
    }
    return loadContent(lesson.data, version.data);
  },
};
