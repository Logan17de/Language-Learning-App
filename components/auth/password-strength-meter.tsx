import { Check, Circle } from "lucide-react";
import { getPasswordStrength } from "@/lib/auth/password-strength";
import { cn } from "@/lib/utils";

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  const tones = ["bg-stone-200", "bg-red-400", "bg-amber-400", "bg-lime-500", "bg-moss-600"];
  const rules = [
    ["length", "8 or more characters"],
    ["upperAndLower", "Upper and lowercase letters"],
    ["number", "At least one number"],
    ["symbol", "At least one symbol"],
  ] as const;

  return (
    <div className="mt-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <span key={step} className={cn("h-1.5 rounded-full", step <= strength.score ? tones[strength.score] : "bg-stone-200")} />
          ))}
        </div>
        <span className="min-w-20 text-right text-xs font-semibold text-stone-500">{strength.label}</span>
      </div>
      <ul className="mt-3 grid gap-1.5 text-xs text-stone-500 sm:grid-cols-2">
        {rules.map(([key, label]) => {
          const passed = strength.checks[key];
          return (
            <li key={key} className={cn("flex items-center gap-1.5", passed && "text-moss-700")}>
              {passed ? <Check className="size-3.5" aria-hidden="true" /> : <Circle className="size-3.5" aria-hidden="true" />}
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
