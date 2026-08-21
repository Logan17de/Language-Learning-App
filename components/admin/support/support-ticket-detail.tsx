"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import {
  adminSupportRepository,
  type AdminSupportDetailData,
} from "@/lib/repositories/admin-support-repository";

export function SupportTicketDetail({ requestId }: { requestId: string }) {
  const [data, setData] = useState<AdminSupportDetailData | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await adminSupportRepository.getTicket(requestId);
    if (result.ok) setData(result.data);
    else setError(result.error.message);
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    let active = true;
    // State updates land in a promise callback rather than synchronously in
    // the effect body, so the initial load cannot cascade renders.
    void Promise.resolve().then(() => {
      if (active) return load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function updateTicket(values: { status?: string; priority?: string }) {
    setWorking(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/support/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Support ticket could not be updated.");
      setWorking(false);
      return;
    }
    setMessage("Support ticket updated.");
    await load();
    setWorking(false);
  }

  async function saveInternalNote(text: string) {
    setWorking(true);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/support/${requestId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, internal: true }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Internal note could not be saved.");
      setWorking(false);
      return;
    }
    setNote("");
    setMessage("Internal note saved.");
    await load();
    setWorking(false);
  }

  if (loading && !data) {
    return (
      <div
        className="h-80 animate-pulse rounded-2xl bg-slate-100"
        aria-label="Loading support ticket"
      />
    );
  }
  if (!data) {
    return (
      <AdminEmptyState
        title="Support ticket could not be loaded"
        description={
          error ||
          "This ticket does not exist or is not visible to the current administrator."
        }
      />
    );
  }

  const ticket = data.ticket;
  const publicMessages = data.messages.filter((item) => !item.internal);
  const internalNotes = data.messages.filter((item) => item.internal);

  return (
    <>
      <AdminPageHeader
        eyebrow="Live support ticket"
        title={ticket.subject}
        description={`${ticket.id} · ${ticket.category} · learner ${data.learner?.display_name || ticket.user_id}`}
        actions={
          <div className="flex items-center gap-2">
            <AdminStatus>{ticket.status}</AdminStatus>
            <Button
              type="button"
              variant="secondary"
              className="rounded-xl"
              disabled={loading || working}
              onClick={() => void load()}
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        }
      />
      {message && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <select
          aria-label="Support status"
          value={ticket.status}
          disabled={working}
          onChange={(event) =>
            void updateTicket({ status: event.target.value })
          }
          className="admin-input w-52"
        >
          {["new", "open", "waiting_for_user", "resolved", "closed"].map(
            (item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ),
          )}
        </select>
        <select
          aria-label="Support priority"
          value={ticket.priority}
          disabled={working}
          onChange={(event) =>
            void updateTicket({ priority: event.target.value })
          }
          className="admin-input w-40"
        >
          {["low", "medium", "high", "urgent"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_23rem]">
        <div className="space-y-6">
          <AdminSection
            title="Conversation record"
            description="Persisted non-internal messages associated with this ticket."
          >
            {publicMessages.length ? (
              publicMessages.map((item) => {
                const adminMessage = item.author_role !== "learner";
                return (
                  <div
                    key={item.id}
                    className={`mb-3 rounded-xl p-4 last:mb-0 ${
                      adminMessage ? "ml-8 bg-teal-50" : "mr-8 bg-slate-100"
                    }`}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="text-xs font-bold capitalize text-slate-500">
                        {adminMessage ? "Admin record" : "Learner"}
                      </p>
                      <time className="text-xs text-slate-400">
                        {new Date(item.created_at).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap leading-6">
                      {item.message}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                No persisted conversation messages yet.
              </p>
            )}
          </AdminSection>

          <AdminSection title="Learner delivery">
            <p className="text-sm leading-6 text-slate-600">
              There is currently no learner-side ticket inbox and no outbound
              email or push delivery for admin replies. A reply control is not
              shown here because saving a message would not actually reach the
              learner.
            </p>
          </AdminSection>
        </div>

        <div className="space-y-6">
          <AdminSection title="Learner context">
            <dl className="space-y-3 text-sm">
              <Fact
                label="Learner"
                value={data.learner?.display_name || ticket.user_id}
              />
              <Fact
                label="JLPT level"
                value={data.learner?.current_jlpt_level || "Unknown"}
              />
              <Fact
                label="Profile plan"
                value={(data.learner?.subscription_plan || "Unknown").replaceAll(
                  "_",
                  " ",
                )}
              />
              <Fact
                label="Subscription status"
                value={data.subscription?.status || "No subscription row"}
              />
              <Fact
                label="Renews"
                value={data.subscription?.renews_at || "—"}
              />
              <Fact
                label="Last message"
                value={new Date(ticket.last_message_at).toLocaleString()}
              />
              <Fact
                label="Assigned to"
                value={ticket.assigned_to || "Unassigned"}
              />
            </dl>
          </AdminSection>

          <AdminSection title="Internal notes">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (note.trim()) void saveInternalNote(note.trim());
              }}
            >
              <textarea
                required
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="admin-input min-h-24 py-3"
                placeholder="Private operational note"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={working || !note.trim()}
                className="mt-3 w-full rounded-xl"
              >
                <Save className="size-4" /> Save internal note
              </Button>
            </form>
            <div className="mt-4">
              {internalNotes.length ? (
                internalNotes.map((item) => (
                  <div
                    key={item.id}
                    className="border-t border-slate-100 py-3"
                  >
                    <div className="flex justify-between gap-2">
                      <strong className="text-xs text-slate-500">
                        Admin note
                      </strong>
                      <time className="text-xs text-slate-400">
                        {new Date(item.created_at).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                      {item.message}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-slate-500">
                  No internal notes.
                </p>
              )}
            </div>
          </AdminSection>
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-400">{label}</dt>
      <dd className="mt-1 break-words capitalize">{value}</dd>
    </div>
  );
}
