"use client";

import { useState, type FormEvent } from "react";
import { MessageSquareReply, Save } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import { useAppStore } from "@/store/app-store";
import type { Priority, SupportTicketStatus } from "@/types/admin";
import { AdminEmptyState, AdminPageHeader, AdminSection, AdminStatus } from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";

export function SupportTicketDetail({ requestId }: { requestId: string }) {
  const request = useAppStore((state) => state.supportRequests.find((item) => item.id === requestId));
  const subscription = useAppStore((state) => state.subscription);
  const ticket = useAdminStore((state) => state.supportTickets[requestId]);
  const update = useAdminStore((state) => state.updateSupportTicket);
  const reply = useAdminStore((state) => state.replyToSupportTicket);
  const [replyText, setReplyText] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  if (!request) return <AdminEmptyState title="Support request not found" description="This support entity ID is invalid or no longer exists." />;
  const status = ticket?.status ?? "new";
  const priority = ticket?.priority ?? "medium";
  function sendReply(event: FormEvent) { event.preventDefault(); if (!replyText.trim()) return; reply(requestId, replyText.trim()); setReplyText(""); setMessage("Mock reply added; ticket is waiting for the user."); }
  function saveNote(event: FormEvent) { event.preventDefault(); if (!note.trim()) return; update(requestId, status, priority, note.trim()); setNote(""); setMessage("Internal note saved."); }
  return (
    <>
      <AdminPageHeader eyebrow="Support ticket" title={request.subject} description={`${request.id} · ${request.type} · ${request.createdAt}`} actions={<AdminStatus>{status}</AdminStatus>} />
      {message && <p role="status" className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">{message}</p>}
      <div className="mb-6 flex flex-wrap gap-2"><select aria-label="Support status" value={status} onChange={(event) => { update(requestId, event.target.value as SupportTicketStatus, priority); setMessage("Support status updated."); }} className="admin-input w-52">{["new", "open", "waiting for user", "resolved", "closed"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Support priority" value={priority} onChange={(event) => update(requestId, status, event.target.value as Priority)} className="admin-input w-40">{["low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_23rem]">
        <div className="space-y-6"><AdminSection title="Request and conversation"><div className="rounded-xl bg-slate-100 p-4"><p className="text-xs font-bold text-slate-500">Learner · {mask(request.email)}</p><p className="mt-2 leading-6">{request.message}</p></div>{ticket?.conversation.map((item) => <div key={item.id} className={`mt-3 rounded-xl p-4 ${item.author === "admin" ? "ml-8 bg-teal-50" : "mr-8 bg-slate-100"}`}><p className="text-xs font-bold capitalize text-slate-500">{item.author} · {new Date(item.createdAt).toLocaleString()}</p><p className="mt-2">{item.message}</p></div>)}</AdminSection><AdminSection title="Reply simulation"><form onSubmit={sendReply}><textarea required value={replyText} onChange={(event) => setReplyText(event.target.value)} className="admin-input min-h-32 py-3" placeholder="Write a mock support reply…" /><Button type="submit" className="mt-3 rounded-xl"><MessageSquareReply className="size-4" /> Add mock reply</Button></form></AdminSection></div>
        <div className="space-y-6"><AdminSection title="User context"><dl className="space-y-3 text-sm"><div><dt className="text-xs font-bold text-slate-400">Email</dt><dd>{mask(request.email)}</dd></div><div><dt className="text-xs font-bold text-slate-400">Current plan</dt><dd className="capitalize">{subscription.plan}</dd></div><div><dt className="text-xs font-bold text-slate-400">Billing interval</dt><dd className="capitalize">{subscription.billingPeriod}</dd></div></dl></AdminSection><AdminSection title="Internal notes"><form onSubmit={saveNote}><textarea required value={note} onChange={(event) => setNote(event.target.value)} className="admin-input min-h-24 py-3" /><Button type="submit" variant="secondary" className="mt-3 w-full rounded-xl"><Save className="size-4" /> Save note</Button></form><div className="mt-4">{ticket?.internalNotes.map((item, index) => <p key={`${item}_${index}`} className="border-t border-slate-100 py-3 text-sm">{item}</p>)}</div></AdminSection></div>
      </div>
    </>
  );
}
function mask(email: string) { return email.replace(/(^.).+(@.*$)/, "$1•••$2"); }
