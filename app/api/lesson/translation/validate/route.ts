import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { evaluateGrammarTranslation } from "@/lib/lesson/translation-practice";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function field(body: Record<string, unknown>, key: string, maximum: number): string {
  const value = body[key];
  return typeof value === "string"
    ? value.normalize("NFKC").trim().slice(0, maximum)
    : "";
}

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
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
    const checked = await evaluateGrammarTranslation({
      userId: auth.userId,
      questionId,
      learnerAnswer: answer,
    });

    const admin = createAdminClient() as unknown as SupabaseClient;
    const prior = await admin
      .from("lesson_activity_answers")
      .select("attempts")
      .eq("lesson_session_id", checked.lessonSessionId)
      .eq("phase", "grammar_translation")
      .eq("activity_id", questionId)
      .maybeSingle();
    if (prior.error) throw new Error(prior.error.message);
    const savedAnswer = await admin.from("lesson_activity_answers").upsert(
      {
        user_id: auth.userId,
        lesson_session_id: checked.lessonSessionId,
        phase: "grammar_translation",
        activity_id: questionId,
        selected_answer: answer,
        correct: checked.evaluation.correct,
        attempts: (prior.data?.attempts ?? 0) + 1,
        answer_data: {
          serverValidated: true,
          targetItemId: checked.targetItemId,
        },
      },
      { onConflict: "lesson_session_id,phase,activity_id" },
    );
    if (savedAnswer.error) throw new Error(savedAnswer.error.message);

    // The question id resolves to the authoritative session and grammar target on
    // the server. A learner cannot redirect mastery by changing request metadata.
    let masterySaved = false;
    const client = await createClient();
    if (client) {
      const rawClient = client as unknown as SupabaseClient;
      const evidence = await rawClient.rpc("record_mastery_evidence", {
        p_session_id: checked.lessonSessionId,
        p_events: [
          {
            clientEventId: `translation:${questionId}`,
            itemType: "grammar",
            itemKey: checked.targetItemId,
            dimension: "meaning",
            signal: checked.evaluation.correct ? "correct" : "incorrect",
            data: {
              source: "translation",
              selectedAnswer: answer,
              questionId,
            },
          },
        ],
      });
      masterySaved = !evidence.error;
    }

    return NextResponse.json({ ...checked.evaluation, masterySaved });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AIko could not check this translation.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
