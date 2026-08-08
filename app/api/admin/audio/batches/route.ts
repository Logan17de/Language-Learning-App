import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { processLessonTtsBatches } from "@/lib/audio/lesson-tts-batches";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type AdminClient = SupabaseClient;

function adminClient(): AdminClient {
  return createAdminClient() as unknown as AdminClient;
}

export async function GET() {
  const auth = await authorize("manage_content");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const admin = adminClient();
  const [pending, batches] = await Promise.all([
    admin
      .from("lesson_tts_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("lesson_tts_batches")
      .select(
        "id,status,trigger_source,lesson_count,processed_count,ready_count,failed_count,generated_audio_count,reused_audio_count,linked_audio_count,created_at,started_at,completed_at,error_message",
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (pending.error || batches.error) {
    return NextResponse.json(
      { error: pending.error?.message ?? batches.error?.message ?? "TTS queue could not be loaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    pendingCount: pending.count ?? 0,
    automaticBatchSize: 100,
    batches: batches.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorize("manage_content");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body: unknown = await request.json().catch(() => ({}));
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};

  // Bulk lesson uploads talk directly to the authenticated Supabase RPC so a
  // 100-lesson JSON payload never needs to pass through Vercel. They then send
  // this tiny request to kick any threshold batch the DB just created.
  if (input.processNext === true) {
    after(async () => {
      try {
        await processLessonTtsBatches();
      } catch (error) {
        console.error("Automatic TTS batch processing failed.", {
          message: error instanceof Error ? error.message : "Unknown TTS batch error.",
        });
      }
    });
    return NextResponse.json({ status: "processing_if_queued" });
  }

  const existingBatchId = typeof input.batchId === "string" ? input.batchId.trim() : "";
  if (existingBatchId) {
    after(async () => {
      try {
        await processLessonTtsBatches({ batchId: existingBatchId });
      } catch (error) {
        console.error("Manual TTS batch processing failed.", {
          batchId: existingBatchId,
          message: error instanceof Error ? error.message : "Unknown TTS batch error.",
        });
      }
    });
    return NextResponse.json({ batchId: existingBatchId, status: "processing" });
  }

  const requestedLimit = typeof input.limit === "number" ? Math.round(input.limit) : 100;
  const limit = Math.max(1, Math.min(requestedLimit, 100));
  const admin = adminClient();
  const created = await admin.rpc("create_lesson_tts_batch", {
    p_limit: limit,
    p_trigger_source: "manual",
  });
  if (created.error) {
    return NextResponse.json(
      { error: created.error.message },
      { status: created.error.code === "42501" ? 403 : 400 },
    );
  }
  const batchId = typeof created.data === "string" ? created.data : null;
  if (!batchId) {
    return NextResponse.json({ error: "There are no pending imported lessons to send." }, { status: 409 });
  }

  after(async () => {
    try {
      await processLessonTtsBatches({ batchId });
    } catch (error) {
      console.error("New TTS batch processing failed.", {
        batchId,
        message: error instanceof Error ? error.message : "Unknown TTS batch error.",
      });
    }
  });

  return NextResponse.json({ batchId, status: "queued", lessonLimit: limit });
}