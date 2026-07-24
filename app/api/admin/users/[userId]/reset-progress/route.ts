import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createClient } from "@/lib/supabase/server";

export async function POST(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const auth = await authorize("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { userId } = await context.params;
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const { data, error } = await client.rpc("reset_learner_progress", { p_user_id: userId });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json(data);
}
