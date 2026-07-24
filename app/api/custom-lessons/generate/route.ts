import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { generateLessonPackage } from "@/lib/openai/lesson-generation";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

interface BeginResult {
  request_id: string;
  job_id: string;
  level: JLPTLevel;
  interests: string[];
}

function beginResult(value: Json): BeginResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value.request_id === "string"
    && typeof value.job_id === "string"
    && (value.level === "N5" || value.level === "N4" || value.level === "N3" || value.level === "N2" || value.level === "N1")
    ? {
      request_id: value.request_id,
      job_id: value.job_id,
      level: value.level,
      interests: Array.isArray(value.interests) ? value.interests.filter((item): item is string => typeof item === "string") : [],
    }
    : null;
}

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid custom lesson request." }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  const topic = typeof value.topic === "string" ? value.topic.trim() : "";
  const durationMinutes = typeof value.durationMinutes === "number" ? value.durationMinutes : 30;
  const focus = typeof value.focus === "string" ? value.focus : "balanced";
  const speakingDifficulty = value.speakingDifficulty === "easy" || value.speakingDifficulty === "hard" ? value.speakingDifficulty : "medium";
  const note = typeof value.note === "string" ? value.note.trim() : "";
  if (topic.length < 2 || topic.length > 120 || ![15, 30, 45, 60].includes(durationMinutes) || note.length > 500) {
    return NextResponse.json({ error: "Check the topic, lesson length, and note." }, { status: 400 });
  }

  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const begun = await client.rpc("begin_custom_lesson_generation", {
    p_topic: topic,
    p_duration_minutes: durationMinutes,
    p_focus: focus,
    p_speaking_difficulty: speakingDifficulty,
    p_note: note,
  });
  if (begun.error) return NextResponse.json({ error: begun.error.message }, { status: begun.error.code === "42501" ? 403 : 400 });
  const generation = beginResult(begun.data);
  if (!generation) return NextResponse.json({ error: "The generation job could not be started." }, { status: 500 });

  const startedAt = Date.now();
  try {
    const lesson = await generateLessonPackage({
      topic,
      level: generation.level,
      interests: generation.interests,
      durationMinutes,
      focus,
      speakingDifficulty,
      note,
    });
    const stored = await client.rpc("store_generated_lesson_package", {
      p_request_id: generation.request_id,
      p_package: lesson,
      p_generation_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
    if (stored.error) throw new Error(stored.error.message);
    return NextResponse.json({ requestId: generation.request_id, jobId: generation.job_id, ...stored.data as object });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lesson generation failed.";
    await client.rpc("fail_custom_lesson_generation", { p_request_id: generation.request_id, p_error: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
