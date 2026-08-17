import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { evaluateGrammarTranslation } from "@/lib/lesson/translation-practice";
import { createClient } from "@/lib/supabase/server";

function field(body: Record<string, unknown>, key: string, maximum: number): string {
  const value = body[key];
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, maximum) : "";
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
  const lessonId = field(body, "lessonId", 160);
  const questionId = field(body, "questionId", 180);
  const english = field(body, "english", 300);
  const targetItemId = field(body, "targetItemId", 80);
  const answer = field(body, "answer", 500);
  if (!lessonId || !questionId || !english || !targetItemId || !answer) {
    return NextResponse.json({ error: "The translation question and answer are required." }, { status: 400 });
  }

  try {
    const evaluation = await evaluateGrammarTranslation({
      english,
      targetItemId,
      learnerAnswer: answer,
    });

    // Record the AI verdict as grammar mastery evidence when an active backend
    // lesson session exists. Failure to sync mastery must not hide the feedback
    // the learner has already received.
    let masterySaved = false;
    const client = await createClient();
    if (client) {
      const rawClient = client as unknown as SupabaseClient;
      const byId = await rawClient.from("lessons").select("id").eq("id", lessonId).maybeSingle();
      const lesson = byId.data
        ? byId.data
        : (await rawClient.from("lessons").select("id").eq("legacy_id", lessonId).maybeSingle()).data;
      if (lesson?.id) {
        const active = await rawClient
          .from("lesson_sessions")
          .select("id")
          .eq("user_id", auth.userId)
          .eq("lesson_id", lesson.id)
          .eq("status", "active")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (active.data?.id) {
          const evidence = await rawClient.rpc("record_mastery_evidence", {
            p_session_id: active.data.id,
            p_events: [{
              clientEventId: `translation:${questionId}:${targetItemId}`,
              itemType: "grammar",
              itemKey: targetItemId,
              dimension: "meaning",
              signal: evaluation.correct ? "correct" : "incorrect",
              data: {
                source: "translation",
                selectedAnswer: answer,
                english,
              },
            }],
          });
          masterySaved = !evidence.error;
        }
      }
    }

    return NextResponse.json({ ...evaluation, masterySaved });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "AIko could not check this translation.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
