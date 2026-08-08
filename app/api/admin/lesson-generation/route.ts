import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import {
  getGenerationBatchDetail,
  importValidGenerationRequests,
  listGenerationBatches,
  normalizeBatchLevel,
  submitLessonBatch,
  syncGenerationBatch,
} from "@/lib/admin-lessons/jlpt-batch-generation";
import {
  assertLessonTargetCapacity,
  getLessonTargetCapacity,
} from "@/lib/admin-lessons/lesson-generation-capacity";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function inputRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: NextRequest) {
  const auth = await authorize("manage_content");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  try {
    const capacityParam = request.nextUrl.searchParams.get("capacityLevel")?.trim();
    if (capacityParam) {
      const level = normalizeBatchLevel(capacityParam);
      if (!level) {
        return NextResponse.json(
          { error: "capacityLevel must be one of N5, N4, N3, N2, or N1." },
          { status: 400 },
        );
      }
      return NextResponse.json({ capacity: await getLessonTargetCapacity(level) });
    }

    const batchId = request.nextUrl.searchParams.get("batchId")?.trim();
    if (batchId) return NextResponse.json(await getGenerationBatchDetail(batchId));
    return NextResponse.json({ batches: await listGenerationBatches() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation batches could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize("manage_content");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = inputRecord(await request.json().catch(() => null));
  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "create") {
      const count = typeof body.count === "number" ? body.count : Number(body.count);
      const level = normalizeBatchLevel(body.level);
      if (!Number.isFinite(count) || count < 1 || count > 100) {
        return NextResponse.json({ error: "count must be a number from 1 to 100." }, { status: 400 });
      }
      if (!level) {
        return NextResponse.json({ error: "level must be one of N5, N4, N3, N2, or N1." }, { status: 400 });
      }

      const capacity = await getLessonTargetCapacity(level);
      try {
        assertLessonTargetCapacity(capacity, Math.round(count));
      } catch (capacityError) {
        return NextResponse.json(
          {
            error: capacityError instanceof Error
              ? capacityError.message
              : "Not enough unique target combinations remain.",
            capacity,
          },
          { status: 409 },
        );
      }

      const created = await submitLessonBatch({ count, level, userId: auth.userId });
      return NextResponse.json(created, { status: 201 });
    }

    if (action === "sync") {
      const batchId = typeof body.batchId === "string" ? body.batchId.trim() : "";
      if (!batchId) return NextResponse.json({ error: "batchId is required." }, { status: 400 });
      return NextResponse.json({ batch: await syncGenerationBatch(batchId) });
    }

    if (action === "import_valid") {
      const batchId = typeof body.batchId === "string" ? body.batchId.trim() : "";
      if (!batchId) return NextResponse.json({ error: "batchId is required." }, { status: 400 });
      const client = await createClient();
      if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
      const result = await importValidGenerationRequests({
        batchId,
        authenticatedClient: client,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown generation action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation operation failed.";
    console.error("Admin JLPT Batch generation operation failed.", {
      action,
      userId: auth.userId,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
