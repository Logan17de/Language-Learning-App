"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import { getBackendMode } from "@/lib/supabase/config";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const demoMode = getBackendMode() === "demo";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!demoMode) {
      setLoading(true);
      const result = await authService.requestPasswordReset(email);
      setLoading(false);
      if (!result.ok) return setError(result.error.message);
    }
    setSent(true);
  }

  return (
    <AuthShell>
      {sent ? (
        <div className="mt-12">
          <span className="grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700"><CheckCircle2 /></span>
          <h1 className="mt-7 text-4xl font-semibold tracking-tight">Check your inbox.</h1>
          <p className="mt-3 leading-7 text-stone-500">{demoMode ? "Demo mode does not send email. Return to login and use any valid demo credentials." : "If an account exists for that email, a secure reset link is on its way."}</p>
          <ButtonLink href="/login" className="mt-8 w-full">Return to login</ButtonLink>
        </div>
      ) : (
        <>
          <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500"><Mail /></span>
          <h1 className="mt-7 text-4xl font-semibold tracking-tight">Reset your password.</h1>
          <p className="mt-3 leading-7 text-stone-500">{demoMode ? "Enter your email to preview the local reset flow." : "Enter your email and we’ll send a secure reset link."}</p>
          <form className="mt-8 space-y-5" onSubmit={submit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Email address</span>
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="form-input" placeholder="you@example.com" autoComplete="email" />
            </label>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <Button disabled={loading} className="w-full">{loading ? "Sending…" : "Send reset link"}</Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
