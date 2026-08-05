import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";

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

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Speech recognition is not configured." },
      { status: 503 },
    );
  }

  const input = await request.formData().catch(() => null);
  const audio = input?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "An audio recording is required." }, { status: 400 });
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
    ]
      .join("\n"),
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
    return NextResponse.json({ transcript: normalizedTranscript });
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
