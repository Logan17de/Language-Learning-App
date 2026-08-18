import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { evaluateGrammarTranslation } from "@/lib/lesson/translation-practice";
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
