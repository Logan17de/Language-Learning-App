import { NextResponse, type NextRequest } from "next/server";
import { processCustomLessonJobs } from "@/lib/custom-lessons/job-runner";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  const secrets = [
    process.env.CUSTOM_LESSON_WORKER_SECRET,
    process.env.CRON_SECRET,
  ].filter((value): value is string => Boolean(value));
  return secrets.some((secret) => header === `Bearer ${secret}`);
}

async function run(request: NextRequest, requestId?: string) {
  const startedAt = Date.now();
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processCustomLessonJobs({
      requestId: requestId && UUID.test(requestId) ? requestId : undefined,
      maxCycles: 1,
    });
    return NextResponse.json({
      ok: true,
      claimed: result.claimed,
      requestId: result.requestId,
      status: result.status,
      lessonReady: result.lessonReady,
      audioStatus: result.audioStatus,
    });
  } catch (error) {
    console.error("Internal custom lesson worker failed.", {
      requestId: requestId ?? null,
      stage: "worker",
      attempt: 1,
      errorClassification: "transient",
      providerRequestId: null,
      durationMs: Date.now() - startedAt,
      action: "resumed",
      message: error instanceof Error ? error.message : "Unknown worker error.",
    });
    return NextResponse.json(
      { error: "The custom lesson worker could not complete this run." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const requestId = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).requestId
    : undefined;
  return run(request, typeof requestId === "string" ? requestId : undefined);
}
