"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import { Button } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getBackendMode } from "@/lib/supabase/config";

function adminOAuthError(code: string | null): string {
  if (!code) return "";
  const messages: Record<string, string> = {
    "admin-access-denied":
      "This Google account does not have access to the admin workspace.",
    "oauth-cancelled":
      "Google sign-in was cancelled. Please try again.",
    "oauth-exchange":
      "Google sign-in could not be completed. Please try again.",
    "oauth-verifier":
      "The temporary Google sign-in session was lost. Please try again in the same browser.",
    "oauth-expired":
      "The Google sign-in request expired. Please start again.",
    "backend-not-configured":
      "Authentication is not configured for this deployment.",
    "auth-callback":
      "Google sign-in could not be completed. Please try again.",
  };
  return messages[code] ?? "Google sign-in could not be completed.";
}

export function AdminLogin() {
  const router = useRouter();
  const search = useSearchParams();
  const login = useAdminStore((state) => state.login);
  const establishBackendSession = useAdminStore((state) => state.establishBackendSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() =>
    adminOAuthError(search.get("error")),
  );
  const [loading, setLoading] = useState(false);
  const demoMode = getBackendMode() === "demo";

  function requestedAdminPath(): string {
    const next = search.get("next");
    return next?.startsWith("/admin") && !next.startsWith("//")
      ? next
      : "/admin";
  }

  async function googleSignIn() {
    setError("");
    if (demoMode) {
      setError("Google sign-in requires the Supabase backend.");
      return;
    }
    setLoading(true);
    const result = await authService.signInWithGoogle(
      "admin",
      requestedAdminPath(),
    );
    if (!result.ok) {
      setLoading(false);
      setError(result.error.message);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (getBackendMode() === "demo" && !login(email, password)) {
      setError("The mock admin credentials do not match.");
      return;
    }
    if (getBackendMode() === "supabase") {
      setLoading(true);
      const result = await authService.signIn(email, password);
      setLoading(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (!canAccessAdmin(result.data.role)) {
        await authService.signOut();
        setError("This account does not have access to the admin workspace.");
        return;
      }
      establishBackendSession(result.data.email, result.data.displayName, result.data.role.replace("_", " "));
    }
    router.replace(requestedAdminPath());
  }

  return (
    <main className="grid min-h-screen bg-slate-950 px-5 py-12 text-white lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-16">
      <section className="mx-auto max-w-xl">
        <span className="grid size-14 place-items-center rounded-2xl bg-teal-400 text-slate-950"><ShieldCheck className="size-7" /></span>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.22em] text-teal-300">AIko operations</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">Content quality, learner trust, operational clarity.</h1>
        <p className="mt-6 max-w-lg leading-7 text-white/55">{demoMode ? "This demo workspace uses deterministic mock data and local persistence." : "This workspace uses server-verified roles, canonical lesson records, and trusted operational mutations."} It is visually and operationally separated from the learner app.</p>
      </section>
      <section className="mx-auto mt-12 w-full max-w-md rounded-3xl bg-white p-7 text-slate-900 shadow-2xl lg:mt-0 sm:p-9">
        <LockKeyhole className="size-6 text-teal-700" />
        <h2 className="mt-5 text-2xl font-bold">Admin sign in</h2>
        <p className="mt-2 text-sm text-slate-500">{demoMode ? "Use the documented local prototype credentials." : "Use an active admin, content editor, or support account."}</p>
        <Button
          type="button"
          variant="secondary"
          className="mt-7 w-full rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
          disabled={loading}
          onClick={googleSignIn}
        >
          <GoogleMark />
          Continue with Google
        </Button>
        <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[.16em] text-slate-300">
          <span className="h-px flex-1 bg-slate-200" />
          or use email
          <span className="h-px flex-1 bg-slate-200" />
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <label className="block"><span className="mb-2 block text-sm font-bold">Email</span><input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label>
          <label className="block"><span className="mb-2 block text-sm font-bold">Password</span><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full rounded-xl bg-slate-950 hover:bg-slate-800">{loading ? "Checking permissions…" : "Open admin workspace"}</Button>
        </form>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.86A6.02 6.02 0 0 1 6.07 12c0-.65.11-1.28.32-1.86V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.01c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z"
      />
    </svg>
  );
}
