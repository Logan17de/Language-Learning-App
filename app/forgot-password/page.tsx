"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import { savePasswordRecoveryAttempt } from "@/lib/auth/password-recovery";
import {
  safeInternalRedirect,
  withSafeNext,
} from "@/lib/auth/safe-internal-redirect";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestedNext, setRequestedNext] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Deferred off the synchronous effect body to avoid cascading renders.
    void Promise.resolve().then(() => {
      if (!active) return;
      setRequestedNext(
        safeInternalRedirect(
          new URLSearchParams(window.location.search).get("next"),
        ),
      );
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const result = await authService.requestPasswordReset(normalizedEmail);
    setLoading(false);
    if (!result.ok) return setError(result.error.message);

    savePasswordRecoveryAttempt(normalizedEmail);
    router.push(withSafeNext("/reset-password", requestedNext));
  }

  return (
    <AuthShell>
      <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
        <Mail />
      </span>
      <h1 className="mt-7 text-4xl font-semibold tracking-tight">
        Reset your password.
      </h1>
      <p className="mt-3 leading-7 text-stone-500">
        Enter your email and we’ll send a 6-digit password-reset code. The code is valid for 5 minutes.
      </p>
      <form className="mt-8 space-y-5" onSubmit={submit}>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Email address</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="form-input"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          >
            {error}
          </p>
        )}
        <Button disabled={loading} className="w-full">
          {loading ? "Sending code…" : "Send reset code"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-600">
        <Link
          href={withSafeNext("/login", requestedNext)}
          className="font-semibold text-moss-700 hover:underline"
        >
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}
