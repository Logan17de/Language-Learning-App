import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/server/audit-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const auth = await authorize("manage_support");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { ticketId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message.trim().slice(0, 5000)
      : "";
  const internal =
    typeof body === "object" &&
    body !== null &&
    "internal" in body &&
    body.internal === true;

  if (!message) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const ticket = await admin
    .from("support_tickets")
    .select("user_id,status")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticket.error) {
    return NextResponse.json({ error: ticket.error.message }, { status: 400 });
  }
  if (!ticket.data) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const inserted = await admin
    .from("support_messages")
    .insert({
      user_id: ticket.data.user_id,
      support_ticket_id: ticketId,
      author_id: auth.userId,
      author_role: auth.role,
      message,
      internal,
    })
    .select("*")
    .single();
  if (inserted.error) {
    return NextResponse.json({ error: inserted.error.message }, { status: 400 });
  }

  if (!internal) {
    await admin
      .from("support_tickets")
      .update({
        status: "waiting_for_user",
        last_message_at: new Date().toISOString(),
      })
      .eq("id", ticketId);
  }

  await writeAudit({
    actorUserId: auth.userId,
    action: internal ? "support.internal_note" : "support.replied",
    entityType: "support_ticket",
    entityId: ticketId,
    metadata: { message_id: inserted.data.id },
  });

  return NextResponse.json(inserted.data);
}
