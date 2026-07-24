import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database } from "@/types/database";

type Ticket = Database["public"]["Tables"]["support_tickets"]["Row"];

export const supportRepository = {
  async listMine(): Promise<RepositoryResult<Ticket[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("support_tickets").select("*").order("last_message_at", { ascending: false });
    return error ? failure(error, "Support tickets could not be loaded.") : success(data ?? []);
  },

  async create(category: string, subject: string, message: string): Promise<RepositoryResult<Ticket>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Please sign in to contact support.");
    const now = new Date().toISOString();
    const ticketResult = await client.from("support_tickets").insert({
      user_id: auth.user.id, category, subject, status: "open", priority: "medium", last_message_at: now,
    }).select("*").single();
    if (ticketResult.error) return failure(ticketResult.error, "Your support ticket could not be created.");
    const { error } = await client.from("support_messages").insert({
      user_id: auth.user.id,
      support_ticket_id: ticketResult.data.id,
      author_id: auth.user.id,
      author_role: "learner",
      message,
      internal: false,
    });
    return error ? failure(error, "The ticket was created, but its message could not be saved.") : success(ticketResult.data);
  },
};
