import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { hasPremiumLessonPhaseAccess } from "@/lib/auth/lesson-phase-access";
import { learnProductContractIsActive } from "@/lib/learn-product-contract";
import { generateGrammarTranslationPractice } from "@/lib/lesson/translation-practice";
import { createClient } from "@/lib/supabase/server";

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

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid translation request." }, { status: 400 });
  }
  const lessonId = "lessonId" in body && typeof body.lessonId === "string"
    ? body.lessonId.trim()
    : "";
  if (!lessonId || lessonId.length > 160) {
    return NextResponse.json({ error: "A valid lesson is required." }, { status: 400 });
  }

  try {
    const questions = await generateGrammarTranslationPractice({
      userId: auth.userId,
      lessonId,
    });
    return NextResponse.json({ questions });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "AIko could not prepare translation practice.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
