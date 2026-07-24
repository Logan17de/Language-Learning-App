"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <AuthShell>
      {sent ? (
        <div className="mt-12">
          <span className="grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700"><CheckCircle2 /></span>
          <h1 className="mt-7 text-4xl font-semibold tracking-tight">Check your inbox.</h1>
          <p className="mt-3 leading-7 text-stone-500">We sent a mock reset link. In this prototype, you can return to login and use any valid demo credentials.</p>
          <ButtonLink href="/login" className="mt-8 w-full">Return to login</ButtonLink>
        </div>
      ) : (
        <>
          <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500"><Mail /></span>
          <h1 className="mt-7 text-4xl font-semibold tracking-tight">Reset your password.</h1>
          <p className="mt-3 leading-7 text-stone-500">Enter your email and we’ll simulate sending a secure reset link.</p>
          <form className="mt-8 space-y-5" onSubmit={submit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Email address</span>
              <input required type="email" className="form-input" placeholder="you@example.com" autoComplete="email" />
            </label>
            <Button className="w-full">Send reset link</Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
