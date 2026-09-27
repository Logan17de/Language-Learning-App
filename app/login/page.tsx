import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="mt-12 text-4xl font-semibold tracking-tight">Welcome back.</h1>
      <p className="mt-3 text-muted">Continue your Japanese path right where you left it.</p>
      <AuthForm mode="login" />
      <p className="mt-8 text-center text-sm text-muted">New to AIko? <Link className="inline-flex min-h-11 items-center rounded-xl px-2 font-semibold text-moss-700 hover:bg-moss-50" href="/signup">Create an account</Link></p>
    </AuthShell>
  );
}
