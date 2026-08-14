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
      "This account is not the AIko owner account.",
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
      "Google sign-in could not be completed.",
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
  const [error, setError] = useState(() => adminOAuthError(search.get("error")));
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
    const result = await authService.signInWithGoogle("admin", requestedAdminPath());
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
        setError("This account is not the AIko owner account.");
        return;
      }
      establishBackendSession(
        result.data.email,
        result.data.displayName,
        result.data.role.replace("_", " "),
      );
    }
    router.replace(requestedAdminPath());
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#252325] px-5 py-12 text-white before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(90deg,rgba(37,35,37,.9),rgba(37,35,37,.68)),url('/images/aiko-world-map.png')] before:bg-cover before:bg-center lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-16">
      <section className="relative mx-auto max-w-xl">
        <span className="grid size-14 rotate-3 place-items-center rounded-2xl border border-persimmon-300/40 bg-moss-900 text-persimmon-300">
          <ShieldCheck className="size-7" />
        </span>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.22em] text-persimmon-300">
          AIko guild operations
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-7xl">
          The private archive.
        </h1>
        <p className="mt-6 max-w-lg leading-7 text-white/55">
          {demoMode
            ? "This demo workspace uses deterministic mock data and local persistence."
            : "Production administration is restricted to AIko's single owner account and server-verified permissions."}
        </p>
      </section>
      <section className="relative mx-auto mt-12 w-full max-w-md rounded-3xl border border-border bg-surface p-7 text-ink shadow-2xl sm:p-9 lg:mt-0">
        <LockKeyhole className="size-6 text-persimmon-600" />
        <h2 className="mt-5 text-2xl font-bold">Owner sign in</h2>
        <p className="mt-2 text-sm text-slate-500">
          {demoMode
            ? "Use the documented local prototype credentials."
            : "Only the configured AIko owner account can open this workspace."}
        </p>
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
          <label className="block">
            <span className="mb-2 block text-sm font-bold">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-950 hover:bg-slate-800"
          >
            {loading ? "Verifying owner…" : "Open private workspace"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
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
