import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import {
  getGenerationRequest,
  importValidGenerationRequests,
  saveManualGenerationLesson,
} from "@/lib/admin-lessons/n5-batch-generation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const auth = await authorize("manage_content");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  try {
    const { requestId } = await context.params;
    return NextResponse.json({ request: await getGenerationRequest(requestId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generated lesson could not be loaded." },
      { status: 404 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const auth = await authorize("manage_content");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || !("lesson" in body)) {
    return NextResponse.json({ error: "lesson is required." }, { status: 400 });
  }
  try {
    const { requestId } = await context.params;
    return NextResponse.json(await saveManualGenerationLesson(
      requestId,
      (body as Record<string, unknown>).lesson,
    ));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manual lesson repair could not be saved." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const auth = await authorize("manage_content");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body: unknown = await request.json().catch(() => ({}));
  const action = body && typeof body === "object" && !Array.isArray(body) && "action" in body
    ? (body as Record<string, unknown>).action
    : null;
  if (action !== "import") {
    return NextResponse.json({ error: "Unknown request action." }, { status: 400 });
  }
  try {
    const { requestId } = await context.params;
    const staged = await getGenerationRequest(requestId);
    if (staged.status !== "valid") {
      return NextResponse.json({ error: "Only a valid staged lesson can be imported." }, { status: 409 });
    }
    const batchId = typeof staged.generation_batch_id === "string"
      ? staged.generation_batch_id
      : "";
    const client = await createClient();
    if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
    return NextResponse.json(await importValidGenerationRequests({
      batchId,
      requestId,
      authenticatedClient: client,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generated lesson could not be imported." },
      { status: 400 },
    );
  }
}
