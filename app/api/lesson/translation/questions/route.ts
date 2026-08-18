import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { generateGrammarTranslationPractice } from "@/lib/lesson/translation-practice";

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
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
