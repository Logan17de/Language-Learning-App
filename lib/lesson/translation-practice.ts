import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";
import { generateStructured } from "@/lib/gemini/structured-output";
import {
  translationEvaluationOutputIssues,
  translationEvaluationPrompt,
  translationEvaluationSchema,
  translationQuestionOutputIssues,
  translationQuestionPrompt,
  translationQuestionSchema,
  type RawTranslationQuestions,
  type TranslationEvaluation,
  type TranslationQuestionTarget,
} from "@/lib/gemini/translation-question-contract";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JLPTLevel } from "@/types/lesson";
import type { GrammarTranslationQuestion } from "@/types/lesson-session";

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const REINFORCEMENT_MIN = 60;
const LEARNED_THRESHOLD = 80;

interface LessonIdentity {
  id: string;
  currentVersionId: string;
  level: JLPTLevel;
  topic: string;
}

interface GrammarRecord {
  id: string;
  legacy_id: string | null;
  pattern: string;
  meaning: string;
  jlpt_level: JLPTLevel;
}

function allowedLevels(level: JLPTLevel): JLPTLevel[] {
  return LEVELS.slice(0, LEVELS.indexOf(level) + 1);
}

function isJlptLevel(value: unknown): value is JLPTLevel {
  return typeof value === "string" && LEVELS.includes(value as JLPTLevel);
}

async function resolveLesson(
  admin: SupabaseClient,
  lessonReference: string,
): Promise<LessonIdentity> {
  const byId = await admin
    .from("lessons")
    .select("id,current_version_id,jlpt_level,topic")
    .eq("id", lessonReference)
    .maybeSingle();
  if (byId.error) {
    throw new Error(`Lesson could not be loaded: ${byId.error.message}`);
  }

  const byLegacy = byId.data
    ? null
    : await admin
        .from("lessons")
        .select("id,current_version_id,jlpt_level,topic")
        .eq("legacy_id", lessonReference)
        .maybeSingle();
  if (byLegacy?.error) {
    throw new Error(`Lesson could not be loaded: ${byLegacy.error.message}`);
  }

  const result = byId.data ?? byLegacy?.data ?? null;
  if (
    !result ||
    typeof result.id !== "string" ||
    typeof result.current_version_id !== "string"
  ) {
    throw new Error("This lesson is unavailable for translation practice.");
  }
  if (!isJlptLevel(result.jlpt_level)) {
    throw new Error("This lesson has an unsupported JLPT level.");
  }
  return {
    id: result.id,
    currentVersionId: result.current_version_id,
    level: result.jlpt_level,
    topic: typeof result.topic === "string" ? result.topic : "Japanese practice",
  };
}

async function activeVersionId(
  admin: SupabaseClient,
  userId: string,
  lesson: LessonIdentity,
): Promise<string> {
  const active = await admin
    .from("lesson_sessions")
    .select("lesson_version_id")
    .eq("user_id", userId)
    .eq("lesson_id", lesson.id)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active.error) {
    throw new Error(`Active lesson could not be loaded: ${active.error.message}`);
  }
  return typeof active.data?.lesson_version_id === "string"
    ? active.data.lesson_version_id
    : lesson.currentVersionId;
}

async function translationTargets(
  userId: string,
  lessonReference: string,
): Promise<{ lesson: LessonIdentity; targets: TranslationQuestionTarget[] }> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const lesson = await resolveLesson(admin, lessonReference);
  const versionId = await activeVersionId(admin, userId, lesson);

  const [lessonGrammar, mastery, records] = await Promise.all([
    admin
      .from("lesson_grammar")
      .select("grammar_id,pattern,meaning,position")
      .eq("lesson_version_id", versionId)
      .order("position", { ascending: true })
      .limit(3),
    admin
      .from("learner_mastery")
      .select("item_key,mastery")
      .eq("user_id", userId)
      .eq("item_type", "grammar")
      .lt("mastery", LEARNED_THRESHOLD),
    admin
      .from("grammar_records")
      .select("id,legacy_id,pattern,meaning,jlpt_level")
      .in("jlpt_level", allowedLevels(lesson.level))
      .is("archived_at", null)
      .neq("quality_status", "rejected")
      .limit(1000),
  ]);

  const error = lessonGrammar.error ?? mastery.error ?? records.error;
  if (error) {
    throw new Error(`Translation targets could not be loaded: ${error.message}`);
  }
  if ((lessonGrammar.data ?? []).length !== 3) {
    throw new Error("Translation practice requires the lesson's three grammar targets.");
  }

  const grammarRecords = (records.data ?? []) as GrammarRecord[];
  const byKey = new Map<string, GrammarRecord>();
  for (const record of grammarRecords) {
    byKey.set(record.id, record);
    if (record.legacy_id) byKey.set(record.legacy_id, record);
    byKey.set(record.pattern, record);
  }

  const lessonTargets: TranslationQuestionTarget[] = (lessonGrammar.data ?? []).map(
    (row) => {
      const grammarId = typeof row.grammar_id === "string" ? row.grammar_id : "";
      const record = byKey.get(grammarId) ?? byKey.get(String(row.pattern ?? ""));
      if (!record) {
        throw new Error(
          `Grammar record is missing for ${String(row.pattern ?? "target pattern")}.`,
        );
      }
      return {
        libraryId: record.id,
        pattern: record.pattern,
        meaning: record.meaning,
        role: "lesson_target" as const,
      };
    },
  );

  const excluded = new Set(lessonTargets.map((target) => target.libraryId));
  const masteryByRecord = new Map<string, number>();
  for (const row of mastery.data ?? []) {
    if (typeof row.item_key !== "string" || typeof row.mastery !== "number") {
      continue;
    }
    const record = byKey.get(row.item_key);
    if (!record || excluded.has(record.id)) continue;
    const previous = masteryByRecord.get(record.id);
    if (previous === undefined || row.mastery > previous) {
      masteryByRecord.set(record.id, row.mastery);
    }
  }

  const ranked = [...masteryByRecord.entries()].flatMap(([id, score]) => {
    const record = byKey.get(id);
    return record ? [{ record, score }] : [];
  });
  const reinforcement = ranked
    .filter(
      ({ score }) =>
        score >= REINFORCEMENT_MIN && score < LEARNED_THRESHOLD,
    )
    .sort((left, right) => {
      const masteryDifference = left.score - right.score;
      if (masteryDifference !== 0) return masteryDifference;
      const levelDifference =
        Number(right.record.jlpt_level === lesson.level) -
        Number(left.record.jlpt_level === lesson.level);
      if (levelDifference !== 0) return levelDifference;
      return left.record.pattern.localeCompare(right.record.pattern, "ja");
    })
    .slice(0, 2)
    .map(({ record }) => record);

  // A learner can reach this feature before two grammar rows occupy the 60-80
  // reinforcement band. Fill only missing slots from the strongest sub-60 rows,
  // then unseen rows, so the phase remains playable. As soon as two 60-80 rows
  // exist, this fallback is not used.
  if (reinforcement.length < 2) {
    const chosen = new Set([
      ...excluded,
      ...reinforcement.map((record) => record.id),
    ]);
    const subSixty = ranked
      .filter(
        ({ record, score }) =>
          !chosen.has(record.id) && score < REINFORCEMENT_MIN,
      )
      .sort((left, right) => right.score - left.score)
      .map(({ record }) => record);
    const unseen = grammarRecords
      .filter(
        (record) => !chosen.has(record.id) && !masteryByRecord.has(record.id),
      )
      .sort((left, right) => {
        const levelDifference =
          Number(right.jlpt_level === lesson.level) -
          Number(left.jlpt_level === lesson.level);
        return (
          levelDifference || left.pattern.localeCompare(right.pattern, "ja")
        );
      });
    for (const record of [...subSixty, ...unseen]) {
      if (reinforcement.length >= 2) break;
      if (chosen.has(record.id)) continue;
      reinforcement.push(record);
      chosen.add(record.id);
    }
  }

  if (reinforcement.length !== 2) {
    throw new Error(
      "Two additional grammar patterns are required for translation practice.",
    );
  }

  return {
    lesson,
    targets: [
      ...lessonTargets,
      ...reinforcement.map((record) => ({
        libraryId: record.id,
        pattern: record.pattern,
        meaning: record.meaning,
        role: "reinforcement" as const,
      })),
    ],
  };
}

export async function generateGrammarTranslationPractice(input: {
  userId: string;
  lessonId: string;
}): Promise<GrammarTranslationQuestion[]> {
  const { lesson, targets } = await translationTargets(
    input.userId,
    input.lessonId,
  );
  const generated = await generateStructured<RawTranslationQuestions>({
    name: "grammar_translation_questions",
    prompt: translationQuestionPrompt({
      level: lesson.level,
      topic: lesson.topic,
      targets,
    }),
    schema: translationQuestionSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: translationQuestionOutputIssues,
    trace: { stage: "grammar_translation_questions" },
  });
  const byIndex = new Map(
    generated.value.questions.map((question) => [question.requestIndex, question]),
  );
  return targets.map((target, index) => {
    const question = byIndex.get(index);
    if (!question) {
      throw new Error(`Translation question ${index + 1} is missing.`);
    }
    if (!storyUsesGrammarPattern(question.modelAnswer, target.pattern)) {
      throw new Error(
        `Translation question ${index + 1} did not naturally realize its required grammar pattern.`,
      );
    }
    return {
      id: `translation:${index}:${target.libraryId}`,
      english: question.english.trim(),
      targetPattern: target.pattern,
      targetMeaning: target.meaning,
      targetItemId: target.libraryId,
      role: target.role,
    };
  });
}

export async function evaluateGrammarTranslation(input: {
  english: string;
  targetItemId: string;
  learnerAnswer: string;
}): Promise<TranslationEvaluation> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const grammar = await admin
    .from("grammar_records")
    .select("id,pattern,meaning")
    .eq("id", input.targetItemId)
    .is("archived_at", null)
    .neq("quality_status", "rejected")
    .maybeSingle();
  if (grammar.error) {
    throw new Error(`Grammar target could not be loaded: ${grammar.error.message}`);
  }
  if (!grammar.data || typeof grammar.data.pattern !== "string") {
    throw new Error("This translation grammar target is unavailable.");
  }
  const generated = await generateStructured<TranslationEvaluation>({
    name: "grammar_translation_validation",
    prompt: translationEvaluationPrompt({
      english: input.english,
      targetPattern: grammar.data.pattern,
      targetMeaning:
        typeof grammar.data.meaning === "string" ? grammar.data.meaning : "",
      learnerAnswer: input.learnerAnswer,
    }),
    schema: translationEvaluationSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: translationEvaluationOutputIssues,
    trace: { stage: "grammar_translation_validation" },
  });
  return generated.value;
}
