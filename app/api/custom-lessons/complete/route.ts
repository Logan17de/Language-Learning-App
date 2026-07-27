import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import {
  generatePlayableLesson,
  type GenerationAuditEntry,
  type StoryDraft,
  type ResolvedLessonLibrary,
} from "@/lib/gemini/lesson-engine-v2";
import { prepareStoredLessonAudio } from "@/lib/audio/audio-library";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ProgressiveDraft {
  request_id: string;
  user_id: string;
  topic: string;
  jlpt_level: JLPTLevel;
  story_draft: Json;
  library_snapshot: Json;
  generation_audit: Json;
  status: "story_ready" | "activities_building" | "activities_failed" | "completed";
  build_attempts: number;
  build_started_at: string | null;
  lesson_id: string | null;
  lesson_version_id: string | null;
  assignment_id: string | null;
  audio_status: "pending" | "building" | "ready" | "failed";
  audio_attempts: number;
  audio_started_at: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resultRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

async function prepareAudio(
  draft: ProgressiveDraft,
  admin: SupabaseClient,
): Promise<Record<string, unknown>> {
  if (!draft.lesson_version_id) return { status: "pending" };
  if (draft.audio_status === "ready") return { status: "ready", cached: true };
  const recentBuild =
    draft.audio_status === "building" &&
    draft.audio_started_at &&
    Date.now() - new Date(draft.audio_started_at).getTime() < 5 * 60 * 1000;
  if (recentBuild) return { status: "building" };
  if (draft.audio_attempts >= 3) return { status: "failed" };

  const attempts = draft.audio_attempts + 1;
  const claimed = await admin
    .from("progressive_lesson_drafts")
    .update({
      audio_status: "building",
      audio_attempts: attempts,
      audio_started_at: new Date().toISOString(),
      audio_error: null,
    })
    .eq("request_id", draft.request_id);
  if (claimed.error) throw new Error(claimed.error.message);

  try {
    const prepared = await prepareStoredLessonAudio(draft.lesson_version_id, admin);
    const saved = await admin
      .from("progressive_lesson_drafts")
      .update({
        audio_status: "ready",
        audio_prepared_at: new Date().toISOString(),
        audio_error: null,
      })
      .eq("request_id", draft.request_id);
    if (saved.error) throw new Error(saved.error.message);
    return prepared;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audio preparation failed.";
    await admin
      .from("progressive_lesson_drafts")
      .update({ audio_status: "failed", audio_error: message.slice(0, 1_000) })
      .eq("request_id", draft.request_id);
    console.error("Post-generation lesson audio failed.", {
      requestId: draft.request_id,
      message,
    });
    return { status: "failed" };
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const body: unknown = await request.json().catch(() => null);
  const requestId =
    body && typeof body === "object" && !Array.isArray(body)
      ? text((body as Record<string, unknown>).requestId)
      : null;
  if (!requestId) {
    return NextResponse.json({ error: "A generation request is required." }, { status: 400 });
  }

  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  }
  const admin = createAdminClient() as unknown as SupabaseClient;
  const found = await admin
    .from("progressive_lesson_drafts")
    .select("*")
    .eq("request_id", requestId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (found.error) {
    return NextResponse.json({ error: found.error.message }, { status: 500 });
  }
  if (!found.data) {
    return NextResponse.json({ error: "The lesson draft was not found." }, { status: 404 });
  }
  let draft = found.data as ProgressiveDraft;

  if (draft.status === "completed" && draft.lesson_id && draft.lesson_version_id) {
    const audio = await prepareAudio(draft, admin);
    return NextResponse.json({
      requestId,
      lesson_id: draft.lesson_id,
      lesson_version_id: draft.lesson_version_id,
      assignment_id: draft.assignment_id,
      status: "published",
      audio,
    });
  }
  if (draft.build_attempts >= 3) {
    return NextResponse.json(
      { error: "This lesson could not be completed after several attempts." },
      { status: 409 },
    );
  }

  const startedAt = Date.now();
  const claimed = await admin
    .from("progressive_lesson_drafts")
    .update({
      status: "activities_building",
      build_attempts: draft.build_attempts + 1,
      build_started_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("request_id", requestId)
    .eq("user_id", auth.userId);
  if (claimed.error) {
    return NextResponse.json({ error: claimed.error.message }, { status: 500 });
  }

  try {
    const audit = Array.isArray(draft.generation_audit)
      ? (draft.generation_audit as unknown as GenerationAuditEntry[])
      : [];
    const lesson = await generatePlayableLesson({
      topic: draft.topic,
      level: draft.jlpt_level,
      draft: draft.story_draft as unknown as StoryDraft,
      library: draft.library_snapshot as unknown as ResolvedLessonLibrary,
      audit,
    });
    const stored = await client.rpc("store_generated_lesson_package_v2", {
      p_request_id: requestId,
      p_package: lesson as unknown as Json,
      p_generation_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
    if (stored.error) throw new Error(stored.error.message);
    const storedValue = resultRecord(stored.data);
    const lessonId = text(storedValue.lesson_id);
    const lessonVersionId = text(storedValue.lesson_version_id);
    const assignmentId = text(storedValue.assignment_id);
    if (!lessonId || !lessonVersionId) {
      throw new Error("The saved lesson identifiers were not returned.");
    }

    const completed = await admin
      .from("progressive_lesson_drafts")
      .update({
        status: "completed",
        lesson_id: lessonId,
        lesson_version_id: lessonVersionId,
        assignment_id: assignmentId,
        last_error: null,
      })
      .eq("request_id", requestId)
      .select("*")
      .single();
    if (completed.error) throw new Error(completed.error.message);
    draft = completed.data as ProgressiveDraft;
    const audio = await prepareAudio(draft, admin);

    return NextResponse.json({
      requestId,
      ...storedValue,
      audio,
    });
  } catch (error) {
    const internalMessage =
      error instanceof Error ? error.message : "Lesson completion failed.";
    await admin
      .from("progressive_lesson_drafts")
      .update({ status: "activities_failed", last_error: internalMessage.slice(0, 1_000) })
      .eq("request_id", requestId);
    if (draft.build_attempts + 1 >= 3) {
      await client.rpc("fail_custom_lesson_generation", {
        p_request_id: requestId,
        p_error: internalMessage,
      });
    }
    console.error("Progressive custom lesson completion failed.", {
      requestId,
      message: internalMessage,
    });
    return NextResponse.json(
      { error: "AIko could not finish this lesson. Please try again." },
      { status: 502 },
    );
  }
}
