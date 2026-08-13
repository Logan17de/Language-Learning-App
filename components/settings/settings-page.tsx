"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  Download,
  Palette,
  Shield,
  TriangleAlert,
} from "lucide-react";
import type {
  LessonFocus,
  ThemePreference,
  UserSettings,
} from "@/types/app-preferences";
import type { DailyMinutes, LearnerLevel } from "@/types/learner";
import { useAppStore } from "@/store/app-store";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const update = useAppStore((state) => state.updateSettings);
  const setLevel = useAppStore((state) => state.setLevel);
  const setDailyMinutes = useAppStore((state) => state.setDailyMinutes);
  const resetProgress = useAppStore((state) => state.resetProgress);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exported, setExported] = useState(false);
  const backendMode = getBackendMode();

  function exportData() {
    if (backendMode === "supabase") {
      window.location.assign("/api/account/export");
      setExported(true);
      window.setTimeout(() => setExported(false), 2200);
      return;
    }

    const payload = JSON.stringify({ profile: user, progress, settings }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "learning-data.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(true);
    window.setTimeout(() => setExported(false), 2200);
  }

  async function confirmProgressReset() {
    if (backendMode === "supabase") {
      const response = await fetch("/api/account/reset-progress", { method: "POST" });
      if (!response.ok) return;
    }
    resetProgress();
    setConfirmReset(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
      <header>
        <p className="section-kicker">Settings</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Learning settings</h1>
        <p className="mt-3 max-w-2xl text-stone-500">
          {backendMode === "supabase"
            ? "Your learning preferences sync to your account."
            : "Your preferences are stored on this device."}
        </p>
      </header>

      <div className="mt-8 space-y-6">
        <SettingsSection
          icon={BookOpen}
          title="Learning"
          description="Set your level, pace, and lesson focus."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Daily goal"
              value={String(user.dailyGoalMinutes)}
              options={["15", "30", "45", "60"]}
              onChange={(value) => setDailyMinutes(Number(value) as DailyMinutes)}
              suffix=" minutes"
            />
            <Select
              label="Current level"
              value={String(user.level)}
              options={["Beginner", "N5", "N4", "N3", "N2", "Not sure"]}
              onChange={(value) => setLevel(value as LearnerLevel)}
            />
            <Select
              label="Preferred lesson length"
              value={String(settings.lessonLength)}
              options={["15", "30", "45", "60"]}
              onChange={(value) =>
                update({
                  lessonLength: Number(value) as UserSettings["lessonLength"],
                })
              }
              suffix=" minutes"
            />
            <Select
              label="Preferred focus"
              value={settings.preferredFocus}
              options={[
                "balanced",
                "conversation",
                "vocabulary",
                "grammar",
                "reading",
                "speaking",
                "workplace Japanese",
              ]}
              onChange={(value) =>
                update({ preferredFocus: value as LessonFocus })
              }
            />
            <Select
              label="Reading difficulty"
              value={settings.readingDifficulty}
              options={["guided", "balanced", "independent"]}
              onChange={(value) =>
                update({
                  readingDifficulty: value as UserSettings["readingDifficulty"],
                })
              }
            />
            <Select
              label="Speaking difficulty"
              value={settings.speakingDifficulty}
              options={["easy", "medium", "hard"]}
              onChange={(value) =>
                update({
                  speakingDifficulty: value as UserSettings["speakingDifficulty"],
                })
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection
          icon={Palette}
          title="Appearance"
          description="Choose how the app theme follows your device."
        >
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
            {(["light", "dark", "system"] as ThemePreference[]).map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={settings.theme === theme}
                onClick={() => update({ theme })}
                className={`min-h-20 rounded-2xl border text-sm font-semibold capitalize focus:outline-none focus:ring-4 focus:ring-moss-100 ${
                  settings.theme === theme
                    ? "border-moss-600 bg-moss-50 text-moss-700"
                    : "border-stone-200 bg-white"
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          icon={Shield}
          title="Data"
          description="Export your learning data or clear your learning progress."
        >
          <div className="rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">
            {backendMode === "supabase"
              ? "Your export includes your profile, settings, lesson activity, mastery data, reports, and support requests."
              : `This device currently stores ${progress.completedLessonIds.length} completed lesson IDs and your local settings.`}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={exportData}>
              <Download className="size-4" /> Export learning data
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmReset(true)}
            >
              <TriangleAlert className="size-4" /> Reset progress
            </Button>
          </div>
          {exported && (
            <p
              className="flex items-center gap-2 text-sm font-semibold text-moss-700"
              role="status"
            >
              <Check className="size-4" /> Learning data export prepared.
            </p>
          )}
        </SettingsSection>
      </div>

      {confirmReset && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-progress-title"
        >
          <div className="w-full max-w-md rounded-4xl bg-white p-7 shadow-float">
            <TriangleAlert className="size-8 text-persimmon-500" />
            <h2 id="reset-progress-title" className="mt-4 text-2xl font-semibold">
              Reset learning progress?
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Lesson history, scores, mastery, and earned progress will be cleared.
              Your account and learning preferences remain.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-persimmon-500 hover:bg-persimmon-600"
                onClick={() => void confirmProgressReset()}
              >
                Reset progress
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  suffix = "",
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  suffix?: string;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-input capitalize"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace("-", " ")}
            {suffix}
          </option>
        ))}
      </select>
    </label>
  );
}
