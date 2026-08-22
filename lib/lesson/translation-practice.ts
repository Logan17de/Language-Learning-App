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
import { isUuid } from "@/lib/identifiers";

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];
const REINFORCEMENT_MIN = 60;
const LEARNED_THRESHOLD = 80;

interface LessonIdentity {
  id: string;
  level: JLPTLevel;
  topic: string;
}

interface ActiveLessonSession {
  id: string;
  lessonVersionId: string;
}

interface GrammarRecord {
  id: string;
  legacy_id: string | null;
  pattern: string;
  meaning: string;
  jlpt_level: JLPTLevel;
}

interface StoredTranslationQuestion {
  id: string;
  english_prompt: string;
  position: number;
}

export interface EvaluatedGrammarTranslation {
  evaluation: TranslationEvaluation;
  lessonSessionId: string;
  targetItemId: string;
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
  const byId = isUuid(lessonReference)
    ? await admin
        .from("lessons")
        .select("id,jlpt_level,topic")
        .eq("id", lessonReference)
        .maybeSingle()
    : null;
  if (byId?.error) {
    throw new Error(`Lesson could not be loaded: ${byId.error.message}`);
  }

  const byLegacy = byId?.data
    ? null
    : await admin
        .from("lessons")
        .select("id,jlpt_level,topic")
        .eq("legacy_id", lessonReference)
        .maybeSingle();
  if (byLegacy?.error) {
    throw new Error(`Lesson could not be loaded: ${byLegacy.error.message}`);
  }

  const result = byId?.data ?? byLegacy?.data ?? null;
  if (!result || typeof result.id !== "string") {
    throw new Error("This lesson is unavailable for translation practice.");
  }
  if (!isJlptLevel(result.jlpt_level)) {
    throw new Error("This lesson has an unsupported JLPT level.");
  }
  return {
    id: result.id,
    level: result.jlpt_level,
    topic: typeof result.topic === "string" ? result.topic : "Japanese practice",
  };
}

async function activeLessonSession(
  admin: SupabaseClient,
  userId: string,
  lessonId: string,
): Promise<ActiveLessonSession> {
  const active = await admin
    .from("lesson_sessions")
    .select("id,lesson_version_id")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active.error) {
    throw new Error(`Active lesson could not be loaded: ${active.error.message}`);
  }
  if (
    !active.data ||
    typeof active.data.id !== "string" ||
    typeof active.data.lesson_version_id !== "string"
  ) {
    throw new Error("Start this lesson before opening translation practice.");
  }
  return {
    id: active.data.id,
    lessonVersionId: active.data.lesson_version_id,
  };
}

function publicQuestions(rows: StoredTranslationQuestion[]): GrammarTranslationQuestion[] {
  return [...rows]
    .sort((left, right) => left.position - right.position)
    .map((row) => ({ id: row.id, english: row.english_prompt }));
}

async function storedQuestions(
  admin: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<StoredTranslationQuestion[]> {
  const result = await admin
    .from("lesson_translation_questions")
    .select("id,english_prompt,position")
    .eq("user_id", userId)
    .eq("lesson_session_id", sessionId)
    .order("position", { ascending: true });
  if (result.error) {
    throw new Error(
      `Translation question state could not be loaded: ${result.error.message}`,
    );
  }
  return (result.data ?? []) as StoredTranslationQuestion[];
}

async function translationTargets(
  admin: SupabaseClient,
  userId: string,
  lesson: LessonIdentity,
  lessonVersionId: string,
): Promise<TranslationQuestionTarget[]> {
  const [lessonGrammar, mastery, records] = await Promise.all([
    admin
      .from("lesson_grammar")
      .select("grammar_id,pattern,meaning,position")
      .eq("lesson_version_id", lessonVersionId)
      .order("position", { ascending: true })
      .limit(3),
    admin
      .from("learner_mastery")
      .select("item_key,mastery,evidence_count")
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
  const masteryByRecord = new Map<string, { score: number; evidenceCount: number }>();
  for (const row of mastery.data ?? []) {
    if (
      typeof row.item_key !== "string" ||
      typeof row.mastery !== "number" ||
      typeof row.evidence_count !== "number"
    ) {
      continue;
    }
    const record = byKey.get(row.item_key);
    if (!record || excluded.has(record.id)) continue;
    const previous = masteryByRecord.get(record.id);
    if (!previous || row.mastery > previous.score) {
      masteryByRecord.set(record.id, {
        score: row.mastery,
        evidenceCount: row.evidence_count,
      });
    }
  }

  const ranked = [...masteryByRecord.entries()].flatMap(([id, state]) => {
    const record = byKey.get(id);
    return record ? [{ record, ...state }] : [];
  });

  const reinforcement: TranslationQuestionTarget[] = ranked
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
    .map(({ record }) => ({
      libraryId: record.id,
      pattern: record.pattern,
      meaning: record.meaning,
      role: "reinforcement" as const,
    }));

  // If the learner does not yet have two patterns in the 60-80 band, use only
  // grammar with real learner evidence. Do not silently test unseen grammar.
  if (reinforcement.length < 2) {
    const chosen = new Set([
      ...excluded,
      ...reinforcement.map((target) => target.libraryId),
    ]);
    const evidenceBackedSubSixty = ranked
      .filter(
        ({ record, score, evidenceCount }) =>
          !chosen.has(record.id) &&
          score < REINFORCEMENT_MIN &&
          evidenceCount > 0,
      )
      .sort((left, right) => right.score - left.score);

    for (const { record } of evidenceBackedSubSixty) {
      if (reinforcement.length >= 2) break;
      if (chosen.has(record.id)) continue;
      reinforcement.push({
        libraryId: record.id,
        pattern: record.pattern,
        meaning: record.meaning,
        role: "reinforcement",
      });
      chosen.add(record.id);
    }
  }

  // A brand-new learner may have no suitable history yet. In that case, repeat
  // lesson grammar for extra production instead of exposing/testing unseen grammar.
  while (reinforcement.length < 2) {
    const fallback = lessonTargets[reinforcement.length % lessonTargets.length];
    reinforcement.push({ ...fallback, role: "lesson_fallback" });
  }

  return [...lessonTargets, ...reinforcement.slice(0, 2)];
}

export async function generateGrammarTranslationPractice(input: {
  userId: string;
  lessonId: string;
}): Promise<GrammarTranslationQuestion[]> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const lesson = await resolveLesson(admin, input.lessonId);
  const session = await activeLessonSession(admin, input.userId, lesson.id);

  const existing = await storedQuestions(admin, input.userId, session.id);
  if (existing.length === 5) return publicQuestions(existing);
  if (existing.length > 0) {
    const cleanup = await admin
      .from("lesson_translation_questions")
      .delete()
      .eq("user_id", input.userId)
      .eq("lesson_session_id", session.id);
    if (cleanup.error) {
      throw new Error(
        `Incomplete translation state could not be reset: ${cleanup.error.message}`,
      );
    }
  }

  const targets = await translationTargets(
    admin,
    input.userId,
    lesson,
    session.lessonVersionId,
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

  const rows = targets.map((target, index) => {
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
      user_id: input.userId,
      lesson_session_id: session.id,
      lesson_id: lesson.id,
      lesson_version_id: session.lessonVersionId,
      position: index + 1,
      english_prompt: question.english.trim(),
      target_item_id: target.libraryId,
      target_pattern: target.pattern,
      target_meaning: target.meaning,
      target_role:
        target.role === "lesson_target"
          ? "lesson"
          : target.role === "lesson_fallback"
            ? "lesson_fallback"
            : "reinforcement",
      model_answer: question.modelAnswer.trim(),
    };
  });

  const inserted = await admin
    .from("lesson_translation_questions")
    .insert(rows)
    .select("id,english_prompt,position")
    .order("position", { ascending: true });

  if (inserted.error) {
    // A second request can race the first one. The unique session/position key
    // makes the first complete set authoritative; return it rather than creating
    // a second client-visible set.
    const raced = await storedQuestions(admin, input.userId, session.id);
    if (raced.length === 5) return publicQuestions(raced);
    throw new Error(
      `Translation questions could not be stored: ${inserted.error.message}`,
    );
  }

  return publicQuestions((inserted.data ?? []) as StoredTranslationQuestion[]);
}

export async function evaluateGrammarTranslation(input: {
  userId: string;
  questionId: string;
  learnerAnswer: string;
}): Promise<EvaluatedGrammarTranslation> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const question = await admin
    .from("lesson_translation_questions")
    .select(
      "id,user_id,lesson_session_id,lesson_id,lesson_version_id,english_prompt,target_item_id,target_pattern,target_meaning,model_answer",
    )
    .eq("id", input.questionId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (question.error) {
    throw new Error(
      `Translation question could not be loaded: ${question.error.message}`,
    );
  }
  if (!question.data) {
    throw new Error("This translation question is unavailable.");
  }

  const active = await admin
    .from("lesson_sessions")
    .select("id")
    .eq("id", question.data.lesson_session_id)
    .eq("user_id", input.userId)
    .eq("lesson_id", question.data.lesson_id)
    .eq("lesson_version_id", question.data.lesson_version_id)
    .eq("status", "active")
    .maybeSingle();
  if (active.error) {
    throw new Error(`Lesson session could not be verified: ${active.error.message}`);
  }
  if (!active.data) {
    throw new Error("This translation question no longer belongs to an active lesson.");
  }

  const generated = await generateStructured<TranslationEvaluation>({
    name: "grammar_translation_validation",
    prompt: translationEvaluationPrompt({
      english: String(question.data.english_prompt ?? ""),
      targetPattern: String(question.data.target_pattern ?? ""),
      targetMeaning: String(question.data.target_meaning ?? ""),
      modelAnswer: String(question.data.model_answer ?? ""),
      learnerAnswer: input.learnerAnswer,
    }),
    schema: translationEvaluationSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: translationEvaluationOutputIssues,
    trace: { stage: "grammar_translation_validation" },
  });

  return {
    evaluation: generated.value,
    lessonSessionId: String(question.data.lesson_session_id),
    targetItemId: String(question.data.target_item_id),
  };
}
