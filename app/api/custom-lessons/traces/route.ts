import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function requestIdFrom(request: NextRequest): string {
  return request.nextUrl.searchParams.get("requestId")?.trim() ?? "";
}

export async function GET(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const requestId = requestIdFrom(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "A generation request is required." },
      { status: 400 },
    );
  }

  const client = await createClient();
  if (!client) {
    return NextResponse.json(
      { error: "Backend is not configured." },
      { status: 503 },
    );
  }

  const result = await (client as unknown as SupabaseClient)
    .from("custom_lesson_generation_traces")
    .select(
      "id,request_id,stage,event_type,attempt,model,prompt,raw_response,response,issues,metadata,created_at",
    )
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(500);

  if (result.error) {
    console.error("Custom lesson generation traces could not be loaded.", {
      requestId,
      userId: auth.userId,
      message: result.error.message,
    });
    return NextResponse.json(
      { error: "The generation trace could not be loaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    requestId,
    count: result.data?.length ?? 0,
    traces: result.data ?? [],
  });
}
