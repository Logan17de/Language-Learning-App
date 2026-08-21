import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { hasPremiumLessonPhaseAccess } from "@/lib/auth/lesson-phase-access";
import { learnProductContractIsActive } from "@/lib/learn-product-contract";
import {
  translationEvaluationOutputIssues,
  translationEvaluationPrompt,
  translationEvaluationSchema,
  type TranslationEvaluation,
} from "@/lib/gemini/translation-question-contract";
import { generateStructured } from "@/lib/gemini/structured-output";
import {
  persistedTranslationResult,
  translationAnswerData,
  validateTranslationAttempt,
} from "@/lib/lesson/translation-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function field(body: Record<string, unknown>, key: string, maximum: number): string {
  const value = body[key];
  return typeof value === "string"
    ? value.normalize("NFKC").trim().slice(0, maximum)
    : "";
}

function finalizedEvidence(row: { correct?: boolean | null; answer_data?: unknown } | null) {
  return row
    ? {
        correct: Boolean(row.correct),
        answerData: row.answer_data,
      }
    : null;
}

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const client = await createClient();
  let contractActive = true;
  try {
    contractActive = client
      ? await learnProductContractIsActive(client as unknown as SupabaseClient)
      : true;
  } catch {
    return NextResponse.json(
      { error: "Translation access could not be verified." },
      { status: 503 },
    );
  }

  if (contractActive && !(await hasPremiumLessonPhaseAccess(auth.userId))) {
    return NextResponse.json(
      { error: "Translation practice is a Premium feature." },
      { status: 403 },
    );
  }

  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid translation answer." }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const questionId = field(body, "questionId", 80);
  const answer = field(body, "answer", 500);
  if (!questionId || !answer) {
    return NextResponse.json(
      { error: "The translation question and answer are required." },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient() as unknown as SupabaseClient;
    const question = await admin
      .from("lesson_translation_questions")
      .select(
        "id,lesson_session_id,lesson_id,lesson_version_id,english_prompt,target_item_id,target_pattern,target_meaning,model_answer",
      )
      .eq("id", questionId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (question.error) {
      throw new Error(`Translation question could not be loaded: ${question.error.message}`);
    }
    if (!question.data) {
      throw new Error("This translation question is unavailable.");
    }
    const translationQuestion = question.data;

    const active = await admin
      .from("lesson_sessions")
      .select("id")
      .eq("id", translationQuestion.lesson_session_id)
      .eq("user_id", auth.userId)
      .eq("lesson_id", translationQuestion.lesson_id)
      .eq("lesson_version_id", translationQuestion.lesson_version_id)
      .eq("status", "active")
      .maybeSingle();
    if (active.error) {
      throw new Error(`Lesson session could not be verified: ${active.error.message}`);
    }
    if (!active.data) {
      throw new Error("This translation question no longer belongs to an active lesson.");
    }

    const prior = await admin
      .from("lesson_activity_answers")
      .select("correct,answer_data")
      .eq("user_id", auth.userId)
      .eq("lesson_session_id", translationQuestion.lesson_session_id)
      .eq("phase", "grammar_translation")
      .eq("activity_id", questionId)
      .maybeSingle();
    if (prior.error) throw new Error(prior.error.message);

    const modelAnswer = String(translationQuestion.model_answer ?? "");
    const result = await validateTranslationAttempt({
      learnerAnswer: answer,
      modelAnswer,
      existing: finalizedEvidence(prior.data),
      evaluateWithAi: async () => {
        const generated = await generateStructured<TranslationEvaluation>({
          name: "grammar_translation_validation",
          prompt: translationEvaluationPrompt({
            english: String(translationQuestion.english_prompt ?? ""),
            targetPattern: String(translationQuestion.target_pattern ?? ""),
            targetMeaning: String(translationQuestion.target_meaning ?? ""),
            modelAnswer,
            learnerAnswer: answer,
          }),
          schema: translationEvaluationSchema,
          strictSchema: true,
          exactSchemaName: true,
          validate: translationEvaluationOutputIssues,
          trace: { stage: "grammar_translation_validation" },
        });
        return generated.value;
      },
    });

    const alreadyFinalized = persistedTranslationResult({
      existing: finalizedEvidence(prior.data),
      modelAnswer,
    });
    if (alreadyFinalized) {
      return NextResponse.json(alreadyFinalized);
    }

    const payload = {
      user_id: auth.userId,
      lesson_session_id: String(translationQuestion.lesson_session_id),
      phase: "grammar_translation",
      activity_id: questionId,
      selected_answer: answer,
      correct: result.correct,
      attempts: 1,
      answer_data: translationAnswerData(
        result,
        String(translationQuestion.target_item_id ?? ""),
      ),
    };

    const savedAnswer = prior.data
      ? await admin
          .from("lesson_activity_answers")
          .update(payload)
          .eq("user_id", auth.userId)
          .eq("lesson_session_id", translationQuestion.lesson_session_id)
          .eq("phase", "grammar_translation")
          .eq("activity_id", questionId)
      : await admin.from("lesson_activity_answers").insert(payload);

    if (savedAnswer.error) {
      const raced = await admin
        .from("lesson_activity_answers")
        .select("correct,answer_data")
        .eq("user_id", auth.userId)
        .eq("lesson_session_id", translationQuestion.lesson_session_id)
        .eq("phase", "grammar_translation")
        .eq("activity_id", questionId)
        .maybeSingle();
      if (!raced.error) {
        const racedResult = persistedTranslationResult({
          existing: finalizedEvidence(raced.data),
          modelAnswer,
        });
        if (racedResult) return NextResponse.json(racedResult);
      }
      throw new Error(savedAnswer.error.message);
    }

    // Translation answers are trusted evidence only. Mastery is awarded once,
    // after the complete Grammar phase passes commit_lesson_phase().
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AIko could not check this translation.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
