"use client";

import { useState, type FormEvent } from "react";
import { Check, Pencil } from "lucide-react";
import type { DailyMinutes, LearnerLevel, LearningGoal } from "@/types/learner";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { profileRepository } from "@/lib/repositories/profile-repository";

const goals: LearningGoal[] = [
  "JLPT preparation",
  "Conversation",
  "Workplace Japanese",
  "Daily life in Japan",
  "Travel",
];
const levels: LearnerLevel[] = [
  "Beginner",
  "N5",
  "N4",
  "N3",
  "N2",
  "N1",
  "Not sure",
];

export function ProfileForm() {
  const user = useAppStore((state) => state.user);
  const onboarding = useAppStore((state) => state.onboarding);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(user.name);
  const [level, setLevel] = useState<LearnerLevel>(user.level);
  const [goal, setGoal] = useState<LearningGoal>(
    onboarding.goal ?? "Conversation",
  );
  const [minutes, setMinutes] = useState<DailyMinutes>(
    onboarding.dailyMinutes ?? 30,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const result = await profileRepository.updateCurrent({
      display_name: name,
      // JLPT level is earned through mastery and is server-owned, so the
      // profile form no longer submits it.
      learning_goal: goal,
      daily_study_minutes: minutes,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setLoading(false);
    if (!result.ok) return setError(result.error.message);

    updateProfile({ name, level, goal, dailyMinutes: minutes });
    completeOnboarding();
    setEditing(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  if (!editing) {
    return (
      <div>
        <dl className="grid gap-5 sm:grid-cols-2">
          <Detail label="Current level" value={user.level} />
          <Detail
            label="Learning goal"
            value={onboarding.goal ?? "Not added yet"}
          />
          <Detail
            label="Daily study time"
            value={
              onboarding.dailyMinutes
                ? `${onboarding.dailyMinutes} minutes`
                : "Not added yet"
            }
          />
        </dl>
        <Button
          type="button"
          variant="secondary"
          className="mt-7"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-4" /> Edit learning profile
        </Button>
        {saved && (
          <p
            className="mt-4 flex items-center gap-2 text-sm font-semibold text-moss-700"
            role="status"
          >
            <Check className="size-4" /> Profile changes synced.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Display name</span>
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="form-input"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Current level"
          value={level}
          onChange={(value) => setLevel(value as LearnerLevel)}
          options={levels}
        />
        <SelectField
          label="Learning goal"
          value={goal}
          onChange={(value) => setGoal(value as LearningGoal)}
          options={goals}
        />
        <SelectField
          label="Daily study time"
          value={String(minutes)}
          onChange={(value) => setMinutes(Number(value) as DailyMinutes)}
          options={["15", "30", "45", "60"]}
          suffix=" minutes"
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-stone-400">
        {label}
      </dt>
      <dd className="mt-2 font-semibold">{value}</dd>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  suffix = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  suffix?: string;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
            {suffix}
          </option>
        ))}
      </Select>
    </label>
  );
}
