"use client";

import { useState, type FormEvent } from "react";
import { Check, Send } from "lucide-react";
import type { SupportRequest } from "@/types/app-preferences";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";

export function SupportForm({
  type,
  onTypeChange,
}: {
  type: SupportRequest["type"];
  onTypeChange: (type: SupportRequest["type"]) => void;
}) {
  const addRequest = useAppStore((state) => state.addSupportRequest);
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addRequest({
      id: `support_${type}_${subject.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 24)}`,
      type,
      email,
      subject,
      message,
      createdAt: "Just now",
    });
    setSuccess(true);
    setSubject("");
    setMessage("");
  }

  if (success) {
    return <div className="rounded-3xl bg-moss-50 p-7 text-center" role="status"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-moss-600 text-white"><Check className="size-6" /></span><h3 className="mt-5 text-xl font-semibold">Request saved locally.</h3><p className="mt-2 text-sm text-stone-500">This frontend prototype recorded your support request for review.</p><Button type="button" variant="secondary" className="mt-5" onClick={() => setSuccess(false)}>Send another request</Button></div>;
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block"><span className="mb-2 block text-sm font-semibold">Request type</span><select value={type} onChange={(event) => onTypeChange(event.target.value as SupportRequest["type"])} className="form-input"><option value="contact">Contact Support</option><option value="technical">Technical Issue</option><option value="lesson">Lesson Issue</option><option value="billing">Billing Help</option></select></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold">Email</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="form-input" placeholder="you@example.com" /></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold">Subject</span><input required minLength={3} value={subject} onChange={(event) => setSubject(event.target.value)} className="form-input" placeholder="What can we help with?" /></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold">Message</span><textarea required minLength={10} value={message} onChange={(event) => setMessage(event.target.value)} className="form-input min-h-32 resize-none py-3" placeholder="Include what you expected and what happened." /></label>
      <Button type="submit" className="w-full"><Send className="size-4" /> Save support request</Button>
    </form>
  );
}
