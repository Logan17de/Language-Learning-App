"use client";

import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import type { DailyMinutes, LearnerLevel, LearningGoal } from "@/types/learner";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { profileRepository } from "@/lib/repositories/profile-repository";
import { getBackendMode } from "@/lib/supabase/config";

const goals: LearningGoal[] = ["JLPT preparation", "Conversation", "Workplace Japanese", "Daily life in Japan", "Travel"];
const levels: LearnerLevel[] = ["Beginner", "N5", "N4", "N3", "N2", "Not sure"];

export function ProfileForm() {
  const user = useAppStore((state) => state.user);
  const onboarding = useAppStore((state) => state.onboarding);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(user.name);
  const [level, setLevel] = useState<LearnerLevel>(user.level);
  const [goal, setGoal] = useState<LearningGoal>(onboarding.goal ?? "Conversation");
  const [minutes, setMinutes] = useState<DailyMinutes>(onboarding.dailyMinutes ?? 30);
  const [interests, setInterests] = useState(onboarding.interests.length ? onboarding.interests : ["Daily life", "Technology"]);
  const [newInterest, setNewInterest] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (getBackendMode() === "supabase") {
      setLoading(true);
      const result = await profileRepository.updateCurrent({
        display_name: name,
        current_jlpt_level: level === "Beginner" || level === "Not sure" ? "N5" : level,
        learning_goal: goal,
        daily_study_minutes: minutes,
        interests,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setLoading(false);
      if (!result.ok) return setError(result.error.message);
    }
    updateProfile({ name, level, goal, dailyMinutes: minutes, interests });
    setEditing(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  function addInterest() {
    const value = newInterest.trim();
    if (!value || interests.includes(value)) return;
    setInterests([...interests, value]);
    setNewInterest("");
  }

  if (!editing) {
    return (
      <div>
        <dl className="grid gap-5 sm:grid-cols-2">
          <Detail label="Current level" value={user.level} />
          <Detail label="Learning goal" value={onboarding.goal ?? "Conversation"} />
          <Detail label="Daily study time" value={`${onboarding.dailyMinutes ?? user.dailyGoalMinutes} minutes`} />
          <Detail label="Interests" value={(onboarding.interests.length ? onboarding.interests : interests).join(", ")} />
        </dl>
        <Button type="button" variant="secondary" className="mt-7" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit learning profile</Button>
        {saved && <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-moss-700" role="status"><Check className="size-4" /> {getBackendMode() === "supabase" ? "Profile changes synced." : "Profile changes saved locally."}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block"><span className="mb-2 block text-sm font-semibold">Display name</span><input required value={name} onChange={(event) => setName(event.target.value)} className="form-input" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Current level" value={level} onChange={(value) => setLevel(value as LearnerLevel)} options={levels} />
        <SelectField label="Learning goal" value={goal} onChange={(value) => setGoal(value as LearningGoal)} options={goals} />
        <SelectField label="Daily study time" value={String(minutes)} onChange={(value) => setMinutes(Number(value) as DailyMinutes)} options={["15", "30", "45", "60"]} suffix=" minutes" />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Interests</p>
        <div className="flex flex-wrap gap-2">{interests.map((interest) => <button key={interest} type="button" onClick={() => setInterests(interests.filter((item) => item !== interest))} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-moss-50 px-4 text-xs font-semibold text-moss-700">{interest}<X className="size-3" /></button>)}</div>
        <div className="mt-3 flex gap-2"><input value={newInterest} onChange={(event) => setNewInterest(event.target.value)} className="form-input" placeholder="Add an interest" /><Button type="button" variant="secondary" onClick={addInterest} className="shrink-0 px-4"><Plus className="size-4" /> Add</Button></div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex gap-3"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save changes"}</Button></div>
    </form>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wide text-stone-400">{label}</dt><dd className="mt-2 font-semibold">{value}</dd></div>;
}

function SelectField({ label, value, onChange, options, suffix = "" }: { label: string; value: string; onChange: (value: string) => void; options: readonly string[]; suffix?: string }) {
  return <label><span className="mb-2 block text-sm font-semibold">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="form-input">{options.map((option) => <option key={option} value={option}>{option}{suffix}</option>)}</select></label>;
}
