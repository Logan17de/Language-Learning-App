import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <AuthShell>
      <h1 className="mt-12 text-4xl font-semibold tracking-tight">Build Japanese that lasts.</h1>
      <p className="mt-3 text-stone-500">Tell us a little about your goals after creating your account.</p>
      <AuthForm mode="signup" />
      <p className="mt-8 text-center text-sm text-stone-500">Already have an account? <Link className="font-semibold text-moss-700 hover:underline" href="/login">Log in</Link></p>
    </AuthShell>
  );
}
