import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { hasPremiumLessonPhaseAccess } from "@/lib/auth/lesson-phase-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/mpga",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/webm",
]);

export async function POST(request: NextRequest) {
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

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Speech recognition is not configured." },
      { status: 503 },
    );
  }

  const input = await request.formData().catch(() => null);
  const audio = input?.get("audio");
  const partial = input?.get("partial") === "true";
  const exerciseId =
    typeof input?.get("exerciseId") === "string"
      ? String(input?.get("exerciseId")).trim()
      : "";
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "An audio recording is required." }, { status: 400 });
  }
  if (!partial && !exerciseId) {
    return NextResponse.json(
      { error: "A speaking exercise is required." },
      { status: 400 },
    );
  }
  const mediaType = audio.type.split(";")[0].toLowerCase();
  if (!ALLOWED_AUDIO_TYPES.has(mediaType) || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Use an MP3, MP4, M4A, WAV, or WebM recording under 25 MB." },
      { status: 400 },
    );
  }

  const form = new FormData();
  form.append("file", audio, audio.name || "aiko-speaking.webm");
  form.append(
    "model",
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe",
  );
  form.append("language", "ja");
  form.append("response_format", "json");
  form.append(
    "prompt",
    [
      "Japanese language-learning speaking practice.",
      "Transcribe only clearly audible Japanese speech, exactly as spoken, using normal Japanese script and punctuation.",
      "If there is no intelligible speech, return an empty transcription.",
      "Never infer, complete, or invent a lesson sentence from silence or unclear audio.",
    ].join("\n"),
  );

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: "no-store",
    });
    const result: unknown = await response.json().catch(() => null);
    const transcript =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>).text
        : null;
    if (!response.ok || typeof transcript !== "string") {
      console.error("OpenAI transcription failed.", {
        userId: auth.userId,
        status: response.status,
      });
      return NextResponse.json(
        { error: "Your recording could not be transcribed. Please try again." },
        { status: 502 },
      );
    }
    const normalizedTranscript = transcript.trim();
    if (!normalizedTranscript) {
      return NextResponse.json(
        { error: "No speech was detected. Please read the sentence aloud and try again." },
        { status: 422 },
      );
    }
    if (partial) {
      return NextResponse.json({ transcript: normalizedTranscript });
    }

    const admin = createAdminClient() as unknown as SupabaseClient;
    const exercise = await admin
      .from("lesson_speaking_activities")
      .select("id,lesson_version_id,model_answer")
      .eq("id", exerciseId)
      .maybeSingle();
    if (exercise.error || !exercise.data) {
      return NextResponse.json(
        { error: "This speaking exercise is unavailable." },
        { status: 404 },
      );
    }

    const session = await admin
      .from("lesson_sessions")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("lesson_version_id", exercise.data.lesson_version_id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session.error || !session.data) {
      return NextResponse.json(
        { error: "Start this lesson before using speaking practice." },
        { status: 409 },
      );
    }

    const score = similarity(normalizedTranscript, exercise.data.model_answer);
    const prior = await admin
      .from("lesson_activity_answers")
      .select("attempts")
      .eq("lesson_session_id", session.data.id)
      .eq("phase", "speaking")
      .eq("activity_id", exerciseId)
      .maybeSingle();
    if (prior.error) throw new Error(prior.error.message);

    const saved = await admin.from("lesson_activity_answers").upsert(
      {
        user_id: auth.userId,
        lesson_session_id: session.data.id,
        phase: "speaking",
        activity_id: exerciseId,
        selected_answer: normalizedTranscript,
        correct: score >= 70,
        attempts: (prior.data?.attempts ?? 0) + 1,
        answer_data: {
          serverValidated: true,
          score,
        },
      },
      { onConflict: "lesson_session_id,phase,activity_id" },
    );
    if (saved.error) throw new Error(saved.error.message);

    return NextResponse.json({ transcript: normalizedTranscript, score });
  } catch (error) {
    console.error("OpenAI transcription request failed.", {
      userId: auth.userId,
      message: error instanceof Error ? error.message : "Unknown transcription error",
    });
    return NextResponse.json(
      { error: "Speech recognition is temporarily unavailable." },
      { status: 502 },
    );
  }
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s、。！？,.!?・「」『』（）()]/g, "");
}

function similarity(leftValue: string, rightValue: string): number {
  const left = normalized(leftValue);
  const right = normalized(rightValue);
  if (!left || !right) return 0;
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let column = 1; column <= right.length; column += 1) {
    let diagonal = rows[0];
    rows[0] = column;
    for (let row = 1; row <= left.length; row += 1) {
      const previous = rows[row];
      rows[row] = Math.min(
        rows[row] + 1,
        rows[row - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return Math.max(
    0,
    Math.round(
      (1 - rows[left.length] / Math.max(left.length, right.length)) * 100,
    ),
  );
}
