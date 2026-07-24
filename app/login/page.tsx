import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="mt-12 text-4xl font-semibold tracking-tight">Welcome back.</h1>
      <p className="mt-3 text-stone-500">Continue your Japanese path right where you left it.</p>
      <AuthForm mode="login" />
      <p className="mt-8 text-center text-sm text-stone-500">New to AIko? <Link className="font-semibold text-moss-700 hover:underline" href="/signup">Create an account</Link></p>
    </AuthShell>
  );
}
