"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const signIn = useAppStore((state) => state.signIn);
  const onboardingComplete = useAppStore((state) => state.onboarding.completed);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    window.setTimeout(() => {
      signIn(mode === "signup" ? name : undefined);
      router.push(onboardingComplete ? "/home" : "/onboarding");
    }, 650);
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      {mode === "signup" && (
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-ink">First name</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} className="form-input" placeholder="Hana" autoComplete="given-name" />
        </label>
      )}
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-ink">Email address</span>
        <input required type="email" className="form-input" placeholder="you@example.com" autoComplete="email" />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-ink">Password</span>
        <span className="relative block">
          <input required minLength={6} type={showPassword ? "text" : "password"} className="form-input pr-12" placeholder="At least 6 characters" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-stone-400 hover:bg-stone-50" aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </span>
      </label>
      {mode === "login" && (
        <div className="text-right">
          <a href="/forgot-password" className="text-sm font-semibold text-moss-700 hover:underline">Forgot password?</a>
        </div>
      )}
      <Button className="w-full" disabled={loading}>
        {loading && <LoaderCircle className="size-4 animate-spin" />}
        {loading ? "Preparing your path…" : mode === "login" ? "Log in" : "Create my account"}
      </Button>
      <p className="text-center text-xs leading-5 text-stone-400">
        Demo mode: any valid email and 6+ character password will work.
      </p>
    </form>
  );
}
