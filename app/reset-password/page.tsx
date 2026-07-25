"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import {
  isStrongEnough,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "@/lib/auth/password-strength";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isStrongEnough(password)) return setError(PASSWORD_REQUIREMENTS_MESSAGE);
    if (password !== confirmation) return setError("The passwords do not match.");
    setLoading(true);
    const result = await authService.updatePassword(password);
    setLoading(false);
    if (!result.ok) return setError(result.error.message);
    router.replace("/home?password=updated");
  }

  return (
    <AuthShell>
      <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700"><KeyRound /></span>
      <h1 className="mt-7 text-4xl font-semibold tracking-tight">Choose a new password.</h1>
      <p className="mt-3 leading-7 text-stone-500">This updates the password for your AIko account.</p>
      <form className="mt-8 space-y-5" onSubmit={submit}>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">New password</span>
          <span className="relative block">
            <input required minLength={PASSWORD_MIN_LENGTH} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="form-input pr-12" autoComplete="new-password" />
            <PasswordVisibility shown={showPassword} onToggle={() => setShowPassword((value) => !value)} />
          </span>
          <PasswordStrengthMeter password={password} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Confirm password</span>
          <span className="relative block">
            <input required minLength={PASSWORD_MIN_LENGTH} type={showConfirmation ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="form-input pr-12" autoComplete="new-password" />
            <PasswordVisibility shown={showConfirmation} onToggle={() => setShowConfirmation((value) => !value)} />
          </span>
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <Button disabled={loading} className="w-full">{loading ? "Updating…" : "Update password"}</Button>
      </form>
    </AuthShell>
  );
}

function PasswordVisibility({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-stone-400 hover:bg-stone-50" aria-label={shown ? "Hide password" : "Show password"}>
      {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}
