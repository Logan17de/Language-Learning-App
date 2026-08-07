import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database, ProfileRow } from "@/types/database";

type Report = Database["public"]["Tables"]["lesson_reports"]["Row"];
type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
type Audit = Database["public"]["Tables"]["audit_logs"]["Row"];
type Ticket = Database["public"]["Tables"]["support_tickets"]["Row"];
type TicketMessage = Database["public"]["Tables"]["support_messages"]["Row"];
type Subscription = Database["public"]["Tables"]["user_subscriptions"]["Row"];

type LearnerContext = Pick<
  ProfileRow,
  "id" | "display_name" | "current_jlpt_level" | "subscription_plan"
>;

export interface AdminReportDetailData {
  report: Report;
  learner: LearnerContext | null;
  lesson: Pick<Lesson, "id" | "title" | "jlpt_level" | "status"> | null;
  audit: Audit[];
}

export interface AdminSupportDetailData {
  ticket: Ticket;
  learner: LearnerContext | null;
  subscription: Subscription | null;
  messages: TicketMessage[];
}

function firstError(results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null;
}

export const adminSupportRepository = {
  async getReport(reportId: string): Promise<RepositoryResult<AdminReportDetailData>> {
    const client = createClient();
    if (!client) return notConfigured();
    const report = await client.from("lesson_reports").select("*").eq("id", reportId).maybeSingle();
    if (report.error) return failure(report.error, "Report could not be loaded.");
    if (!report.data) return failure({ code: "PGRST116" }, "Report not found.");

    const [learner, lesson, audit] = await Promise.all([
      client.from("profiles").select("id,display_name,current_jlpt_level,subscription_plan").eq("id", report.data.user_id).maybeSingle(),
      client.from("lessons").select("id,title,jlpt_level,status").eq("id", report.data.lesson_id).maybeSingle(),
      client.from("audit_logs").select("*").eq("entity_type", "lesson_report").eq("entity_id", reportId).order("created_at", { ascending: false }).limit(100),
    ]);
    const error = firstError([learner, lesson, audit]);
    if (error) return failure(error, "Report context could not be loaded.");
    return success({ report: report.data, learner: learner.data ?? null, lesson: lesson.data ?? null, audit: audit.data ?? [] });
  },

  async getTicket(ticketId: string): Promise<RepositoryResult<AdminSupportDetailData>> {
    const client = createClient();
    if (!client) return notConfigured();
    const ticket = await client.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
    if (ticket.error) return failure(ticket.error, "Support ticket could not be loaded.");
    if (!ticket.data) return failure({ code: "PGRST116" }, "Support ticket not found.");

    const [learner, subscriptions, messages] = await Promise.all([
      client.from("profiles").select("id,display_name,current_jlpt_level,subscription_plan").eq("id", ticket.data.user_id).maybeSingle(),
      client.from("user_subscriptions").select("*").eq("user_id", ticket.data.user_id).order("created_at", { ascending: false }).limit(1),
      client.from("support_messages").select("*").eq("support_ticket_id", ticketId).order("created_at"),
    ]);
    const error = firstError([learner, subscriptions, messages]);
    if (error) return failure(error, "Support conversation could not be loaded.");
    return success({ ticket: ticket.data, learner: learner.data ?? null, subscription: subscriptions.data?.[0] ?? null, messages: messages.data ?? [] });
  },
};
