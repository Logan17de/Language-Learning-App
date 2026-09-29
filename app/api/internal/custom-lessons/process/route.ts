import { NextResponse, type NextRequest } from "next/server";
import { processCustomLessonFastPath } from "@/lib/custom-lessons/fast-path";
import { getCustomLessonSchedulerDiagnostics } from "@/lib/custom-lessons/scheduler-diagnostics";
import { customLessonWorkerAuthorized } from "@/lib/custom-lessons/worker-authorization";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorized(request: NextRequest): boolean {
  return customLessonWorkerAuthorized(request.headers.get("authorization"));
}

async function run(request: NextRequest, requestId?: string) {
  const startedAt = Date.now();
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processCustomLessonFastPath({
      requestId: requestId && UUID.test(requestId) ? requestId : undefined,
      deferAudio: true,
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
  if (request.nextUrl.searchParams.get("diagnostics") === "1") {
    if (!authorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    try {
      const diagnostics = await getCustomLessonSchedulerDiagnostics();
      return NextResponse.json(
        { ok: diagnostics.ready, diagnostics },
        { status: diagnostics.ready ? 200 : 503 },
      );
    } catch (error) {
      console.error("Custom lesson scheduler diagnostics failed.", error);
      return NextResponse.json(
        { error: "Scheduler diagnostics are unavailable." },
        { status: 503 },
      );
    }
  }
  return run(request);
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const requestId = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).requestId
    : undefined;
  return run(request, typeof requestId === "string" ? requestId : undefined);
}
