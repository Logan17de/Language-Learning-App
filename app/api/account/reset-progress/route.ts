import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const auth = await authorize("learn");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const { data, error } = await client.rpc("reset_learner_progress", { p_user_id: auth.userId });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}
