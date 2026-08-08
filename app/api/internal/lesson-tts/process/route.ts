import { NextResponse, type NextRequest } from "next/server";
import { processLessonTtsBatches } from "@/lib/audio/lesson-tts-batches";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CUSTOM_LESSON_WORKER_SECRET ?? process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const body: unknown = request.method === "POST"
    ? await request.json().catch(() => null)
    : null;
  const batchId = body && typeof body === "object" && !Array.isArray(body)
    && typeof (body as Record<string, unknown>).batchId === "string"
    ? String((body as Record<string, unknown>).batchId)
    : undefined;

  try {
    const result = await processLessonTtsBatches({ batchId });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Internal lesson TTS worker failed.", {
      batchId,
      message: error instanceof Error ? error.message : "Unknown TTS worker error.",
    });
    return NextResponse.json(
      { error: "The lesson TTS worker could not complete this run." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
