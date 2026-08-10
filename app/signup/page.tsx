import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <AuthShell>
      <h1 className="mt-12 text-4xl font-semibold tracking-tight">Build Japanese that lasts.</h1>
      <p className="mt-3 text-muted">Tell us a little about your goals after creating your account.</p>
      <AuthForm mode="signup" />
      <p className="mt-8 text-center text-sm text-muted">Already have an account? <Link className="inline-flex min-h-11 items-center rounded-xl px-2 font-semibold text-moss-700 hover:bg-moss-50" href="/login">Log in</Link></p>
    </AuthShell>
  );
}
