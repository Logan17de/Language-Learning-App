import { NextResponse, type NextRequest } from "next/server";
import { syncActiveGenerationBatches } from "@/lib/admin-lessons/lesson-batch-generation";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret =
    process.env.LESSON_GENERATION_WORKER_SECRET ??
    process.env.CUSTOM_LESSON_WORKER_SECRET ??
    process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const batches = await syncActiveGenerationBatches(10);
    return NextResponse.json({ ok: true, synced: batches.length, batches });
  } catch (error) {
    console.error("Internal lesson Batch sync failed.", {
      message: error instanceof Error ? error.message : "Unknown Batch sync error.",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lesson Batch sync failed." },
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
