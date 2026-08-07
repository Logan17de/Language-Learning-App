"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MessageSquareReply, RefreshCw, Save } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { Priority, SupportTicketStatus } from "@/types/admin";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import {
  adminSupportRepository,
  type AdminSupportDetailData,
} from "@/lib/repositories/admin-support-repository";

export function SupportTicketDetail({ requestId }: { requestId: string }) {
  if (getBackendMode() === "supabase") return <BackendSupportDetail requestId={requestId} />;
  return <DemoSupportDetail requestId={requestId} />;
}

function BackendSupportDetail({ requestId }: { requestId: string }) {
  const [data, setData] = useState<AdminSupportDetailData | null>(null);
  const [replyText, setReplyText] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const result = await adminSupportRepository.getTicket(requestId);
    if (result.ok) setData(result.data);
    else setError(result.error.message);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [requestId]);

  async function updateTicket(values: { status?: string; priority?: string }) {
    setWorking(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/support/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Support ticket could not be updated.");
      setWorking(false);
      return;
    }
    setMessage("Support ticket updated.");
    await load();
    setWorking(false);
  }

  async function saveMessage(text: string, internal: boolean) {
    setWorking(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/support/${requestId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, internal }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Support message could not be saved.");
      setWorking(false);
      return;
    }
    if (internal) {
      setNote("");
      setMessage("Internal note saved.");
    } else {
      setReplyText("");
      setMessage("Reply saved to the support conversation. Learner-side ticket delivery UI is not implemented yet, so this does not send an email or push notification.");
    }
    await load();
    setWorking(false);
  }

  if (loading && !data) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading support ticket" />;
  if (!data) return <AdminEmptyState title="Support ticket could not be loaded" description={error || "This ticket does not exist or is not visible to the current administrator."} />;

  const ticket = data.ticket;
  const publicMessages = data.messages.filter((item) => !item.internal);
  const internalNotes = data.messages.filter((item) => item.internal);

  return (
    <>
      <AdminPageHeader
        eyebrow="Live support ticket"
        title={ticket.subject}
        description={`${ticket.id} · ${ticket.category} · learner ${data.learner?.display_name || ticket.user_id}`}
        actions={<div className="flex items-center gap-2"><AdminStatus>{ticket.status}</AdminStatus><Button type="button" variant="secondary" className="rounded-xl" disabled={loading || working} onClick={() => void load()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div>}
      />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

      <div className="mb-6 flex flex-wrap gap-2">
        <select aria-label="Support status" value={ticket.status} disabled={working} onChange={(event) => void updateTicket({ status: event.target.value })} className="admin-input w-52">{["new", "open", "waiting_for_user", "resolved", "closed"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
        <select aria-label="Support priority" value={ticket.priority} disabled={working} onChange={(event) => void updateTicket({ priority: event.target.value })} className="admin-input w-40">{["low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_23rem]">
        <div className="space-y-6">
          <AdminSection title="Conversation" description="Persisted support messages for this ticket.">
            {publicMessages.length ? publicMessages.map((item) => {
              const adminMessage = item.author_role !== "learner";
              return <div key={item.id} className={`mb-3 rounded-xl p-4 last:mb-0 ${adminMessage ? "ml-8 bg-teal-50" : "mr-8 bg-slate-100"}`}><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-bold capitalize text-slate-500">{adminMessage ? "Admin" : "Learner"}</p><time className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time></div><p className="mt-2 whitespace-pre-wrap leading-6">{item.message}</p></div>;
            }) : <p className="py-8 text-center text-sm text-slate-500">No persisted conversation messages yet.</p>}
          </AdminSection>

          <AdminSection title="Save reply to ticket">
            <form onSubmit={(event) => { event.preventDefault(); if (replyText.trim()) void saveMessage(replyText.trim(), false); }}>
              <textarea required value={replyText} onChange={(event) => setReplyText(event.target.value)} className="admin-input min-h-32 py-3" placeholder="Write a support reply…" />
              <Button type="submit" disabled={working || !replyText.trim()} className="mt-3 rounded-xl"><MessageSquareReply className="size-4" />Save reply</Button>
            </form>
            <p className="mt-3 text-xs leading-5 text-amber-700">This persists the reply and moves the ticket to waiting for user. AIko does not yet surface the conversation in the learner support page or send outbound email/push notifications.</p>
          </AdminSection>
        </div>

        <div className="space-y-6">
          <AdminSection title="Learner context">
            <dl className="space-y-3 text-sm">
              <Fact label="Learner" value={data.learner?.display_name || ticket.user_id} />
              <Fact label="JLPT level" value={data.learner?.current_jlpt_level || "Unknown"} />
              <Fact label="Profile plan" value={(data.learner?.subscription_plan || "Unknown").replaceAll("_", " ")} />
              <Fact label="Subscription status" value={data.subscription?.status || "No subscription row"} />
              <Fact label="Renews" value={data.subscription?.renews_at || "—"} />
              <Fact label="Last message" value={new Date(ticket.last_message_at).toLocaleString()} />
              <Fact label="Assigned to" value={ticket.assigned_to || "Unassigned"} />
            </dl>
          </AdminSection>

          <AdminSection title="Internal notes">
            <form onSubmit={(event) => { event.preventDefault(); if (note.trim()) void saveMessage(note.trim(), true); }}><textarea required value={note} onChange={(event) => setNote(event.target.value)} className="admin-input min-h-24 py-3" placeholder="Private operational note" /><Button type="submit" variant="secondary" disabled={working || !note.trim()} className="mt-3 w-full rounded-xl"><Save className="size-4" />Save internal note</Button></form>
            <div className="mt-4">{internalNotes.length ? internalNotes.map((item) => <div key={item.id} className="border-t border-slate-100 py-3"><div className="flex justify-between gap-2"><strong className="text-xs text-slate-500">Admin note</strong><time className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.message}</p></div>) : <p className="py-4 text-center text-sm text-slate-500">No internal notes.</p>}</div>
          </AdminSection>
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold text-slate-400">{label}</dt><dd className="mt-1 break-words capitalize">{value}</dd></div>;
}

function DemoSupportDetail({ requestId }: { requestId: string }) {
  const request = useAppStore((state) => state.supportRequests.find((item) => item.id === requestId));
  const subscription = useAppStore((state) => state.subscription);
  const ticket = useAdminStore((state) => state.supportTickets[requestId]);
  const update = useAdminStore((state) => state.updateSupportTicket);
  const reply = useAdminStore((state) => state.replyToSupportTicket);
  const [replyText, setReplyText] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  if (!request) return <AdminEmptyState title="Support request not found" description="This demo support entity ID is invalid or no longer exists." />;
  const status = ticket?.status ?? "new";
  const priority = ticket?.priority ?? "medium";
  function sendReply(event: FormEvent) { event.preventDefault(); if (!replyText.trim()) return; reply(requestId, replyText.trim()); setReplyText(""); setMessage("Demo reply added."); }
  function saveNote(event: FormEvent) { event.preventDefault(); if (!note.trim()) return; update(requestId, status, priority, note.trim()); setNote(""); setMessage("Demo internal note saved."); }
  return (
    <>
      <AdminPageHeader eyebrow="Demo support ticket" title={request.subject} description={`${request.id} · ${request.type} · ${request.createdAt}`} actions={<AdminStatus>{status}</AdminStatus>} />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      <div className="mb-6 flex flex-wrap gap-2"><select aria-label="Support status" value={status} onChange={(event) => { update(requestId, event.target.value as SupportTicketStatus, priority); setMessage("Demo support status updated."); }} className="admin-input w-52">{["new", "open", "waiting for user", "resolved", "closed"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Support priority" value={priority} onChange={(event) => update(requestId, status, event.target.value as Priority)} className="admin-input w-40">{["low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_23rem]"><div className="space-y-6"><AdminSection title="Request and conversation"><div className="rounded-xl bg-slate-100 p-4"><p className="text-xs font-bold text-slate-500">Learner · {mask(request.email)}</p><p className="mt-2 leading-6">{request.message}</p></div>{ticket?.conversation.map((item) => <div key={item.id} className={`mt-3 rounded-xl p-4 ${item.author === "admin" ? "ml-8 bg-teal-50" : "mr-8 bg-slate-100"}`}><p className="text-xs font-bold capitalize text-slate-500">{item.author} · {new Date(item.createdAt).toLocaleString()}</p><p className="mt-2">{item.message}</p></div>)}</AdminSection><AdminSection title="Reply simulation"><form onSubmit={sendReply}><textarea required value={replyText} onChange={(event) => setReplyText(event.target.value)} className="admin-input min-h-32 py-3" placeholder="Write a demo support reply…" /><Button type="submit" className="mt-3 rounded-xl"><MessageSquareReply className="size-4" />Add demo reply</Button></form></AdminSection></div><div className="space-y-6"><AdminSection title="User context"><dl className="space-y-3 text-sm"><Fact label="Email" value={mask(request.email)} /><Fact label="Current plan" value={subscription.plan} /><Fact label="Billing interval" value={subscription.billingPeriod} /></dl></AdminSection><AdminSection title="Internal notes"><form onSubmit={saveNote}><textarea required value={note} onChange={(event) => setNote(event.target.value)} className="admin-input min-h-24 py-3" /><Button type="submit" variant="secondary" className="mt-3 w-full rounded-xl"><Save className="size-4" />Save note</Button></form><div className="mt-4">{ticket?.internalNotes.map((item, index) => <p key={`${item}_${index}`} className="border-t border-slate-100 py-3 text-sm">{item}</p>)}</div></AdminSection></div></div>
    </>
  );
}

function mask(email: string) {
  return email.replace(/(^.).+(@.*$)/, "$1•••$2");
}
