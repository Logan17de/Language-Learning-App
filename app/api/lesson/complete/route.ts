import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createClient } from "@/lib/supabase/server";
import { validateLessonScoreSubmission, type LessonScoreSubmission } from "@/lib/scoring-validation";
import type { Json } from "@/types/database";

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("sessionId" in body) || typeof body.sessionId !== "string" || !("metrics" in body)) {
    return NextResponse.json({ error: "Invalid completion payload." }, { status: 400 });
  }
  const metrics = body.metrics as LessonScoreSubmission;
  const errors = validateLessonScoreSubmission(metrics);
  if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const submittedData: Json = "completionData" in body ? body.completionData as Json : {};
  const completionData: Json = {
    submitted: submittedData,
    metrics: {
      vocabulary_correct: metrics.vocabularyCorrect,
      vocabulary_total: metrics.vocabularyTotal,
      grammar_correct: metrics.grammarCorrect,
      grammar_total: metrics.grammarTotal,
      review_correct: metrics.reviewCorrect,
      review_total: metrics.reviewTotal,
    },
  };
  const result = await client.rpc("complete_lesson_session", {
    p_session_id: body.sessionId,
    p_score: metrics.score,
    p_xp: metrics.xp,
    p_duration_minutes: metrics.durationMinutes,
    p_completion_data: completionData,
  });
  return result.error ? NextResponse.json({ error: result.error.message }, { status: 400 }) : NextResponse.json(result.data);
}
