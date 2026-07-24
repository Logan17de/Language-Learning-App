"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useAdminStore } from "@/store/admin-store";
import { Button } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getBackendMode } from "@/lib/supabase/config";

export function AdminLogin() {
  const router = useRouter();
  const search = useSearchParams();
  const login = useAdminStore((state) => state.login);
  const establishBackendSession = useAdminStore((state) => state.establishBackendSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const demoMode = getBackendMode() === "demo";

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
    const next = search.get("next");
    router.replace(next?.startsWith("/admin") ? next : "/admin");
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
        <form className="mt-7 space-y-5" onSubmit={submit}>
          <label className="block"><span className="mb-2 block text-sm font-bold">Email</span><input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label>
          <label className="block"><span className="mb-2 block text-sm font-bold">Password</span><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100" /></label>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full rounded-xl bg-slate-950 hover:bg-slate-800">{loading ? "Checking permissions…" : "Open admin workspace"}</Button>
        </form>
      </section>
    </main>
  );
}
