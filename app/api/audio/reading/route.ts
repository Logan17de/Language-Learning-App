import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { hasPremiumLessonPhaseAccess } from "@/lib/auth/lesson-phase-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { japaneseToDisplayRomaji } from "@/lib/japanese-romaji";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!(await hasPremiumLessonPhaseAccess(auth.userId))) {
    return NextResponse.json(
      { error: "Speaking practice is available with Premium." },
      { status: 403 },
    );
  }
  const exerciseId = request.nextUrl.searchParams.get("exerciseId")?.trim();
  if (!exerciseId) {
    return NextResponse.json({ error: "A speaking exercise is required." }, { status: 400 });
  }

  const admin = createAdminClient() as unknown as SupabaseClient;
  const exercise = await admin
    .from("lesson_speaking_activities")
    .select("model_answer")
    .eq("id", exerciseId)
    .maybeSingle();
  if (exercise.error || !exercise.data) {
    return NextResponse.json({ error: "This speaking exercise is unavailable." }, { status: 404 });
  }

  try {
    return NextResponse.json({
      romaji: await japaneseToDisplayRomaji(exercise.data.model_answer),
    });
  } catch {
    return NextResponse.json(
      { error: "The reading hint could not be prepared." },
      { status: 500 },
    );
  }
}
