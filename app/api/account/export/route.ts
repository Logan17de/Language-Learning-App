import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await authorize("learn");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const userId = auth.userId;
  const [profile, preferences, settings, subscriptions, assignments, sessions, completions, mastery, queue, reviews, customRequests, reports, tickets] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).single(),
    client.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
    client.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
    client.from("user_subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    client.from("lesson_assignments").select("*").eq("user_id", userId),
    client.from("lesson_sessions").select("*").eq("user_id", userId),
    client.from("lesson_completions").select("*").eq("user_id", userId),
    client.from("learner_mastery").select("*").eq("user_id", userId),
    client.from("review_queue").select("*").eq("user_id", userId),
    client.from("review_results").select("*").eq("user_id", userId),
    client.from("custom_lesson_requests").select("*").eq("user_id", userId),
    client.from("lesson_reports").select("*").eq("user_id", userId),
    client.from("support_tickets").select("*").eq("user_id", userId),
  ]);
  const firstError = [profile, preferences, settings, subscriptions, assignments, sessions, completions, mastery, queue, reviews, customRequests, reports, tickets].find((result) => result.error)?.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });
  const body = {
    exportedAt: new Date().toISOString(),
    profile: profile.data,
    preferences: preferences.data,
    settings: settings.data,
    subscription: subscriptions.data,
    lessonAssignments: assignments.data,
    lessonSessions: sessions.data,
    lessonCompletions: completions.data,
    mastery: mastery.data,
    reviewQueue: queue.data,
    reviewResults: reviews.data,
    customLessonRequests: customRequests.data,
    lessonReports: reports.data,
    supportTickets: tickets.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="aiko-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
