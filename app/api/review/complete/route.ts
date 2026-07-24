import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createClient } from "@/lib/supabase/server";
import { validateReviewScore } from "@/lib/scoring-validation";

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("sessionId" in body) || typeof body.sessionId !== "string"
    || !("score" in body) || typeof body.score !== "number" || !("correctCount" in body) || typeof body.correctCount !== "number"
    || !("totalCount" in body) || typeof body.totalCount !== "number" || !("xp" in body) || typeof body.xp !== "number") {
    return NextResponse.json({ error: "Invalid review payload." }, { status: 400 });
  }
  const errors = validateReviewScore(body.score, body.correctCount, body.totalCount, body.xp);
  if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  const improved = "improvedItemIds" in body && Array.isArray(body.improvedItemIds) ? body.improvedItemIds.filter((id): id is string => typeof id === "string") : [];
  const weak = "weakItemIds" in body && Array.isArray(body.weakItemIds) ? body.weakItemIds.filter((id): id is string => typeof id === "string") : [];
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const result = await client.rpc("complete_review_session", {
    p_session_id: body.sessionId,
    p_score: body.score,
    p_correct_count: body.correctCount,
    p_total_count: body.totalCount,
    p_improved_item_ids: improved,
    p_weak_item_ids: weak,
    p_xp: body.xp,
  });
  return result.error ? NextResponse.json({ error: result.error.message }, { status: 400 }) : NextResponse.json(result.data);
}
