"use client";

import { useState } from "react";
import { Bell, BookOpen, Check, Download, Headphones, Mic2, Palette, Shield, Trash2, TriangleAlert } from "lucide-react";
import type { LessonFocus, ThemePreference, UserSettings } from "@/types/app-preferences";
import type { DailyMinutes, LearnerLevel } from "@/types/learner";
import { useAppStore } from "@/store/app-store";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
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
  const resetDemo = useAppStore((state) => state.resetDemo);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);
  const [exported, setExported] = useState(false);

  function exportData() {
    if (getBackendMode() === "supabase") {
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
    anchor.download = "aiko-learning-data.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(true);
    window.setTimeout(() => setExported(false), 2200);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
      <header><p className="section-kicker">Settings</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Make AIko fit your routine.</h1><p className="mt-3 max-w-2xl text-stone-500">{getBackendMode() === "supabase" ? "Preferences sync to your account and remain cached on this device." : "All preferences remain on this device and can be changed at any time."}</p></header>
      <div className="mt-8 space-y-6">
        <SettingsSection icon={BookOpen} title="Learning" description="Set the pace and kind of support you prefer.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Daily goal" value={String(user.dailyGoalMinutes)} options={["15", "30", "45", "60"]} onChange={(value) => setDailyMinutes(Number(value) as DailyMinutes)} suffix=" minutes" />
            <Select label="Current level" value={String(user.level)} options={["Beginner", "N5", "N4", "N3", "N2", "Not sure"]} onChange={(value) => setLevel(value as LearnerLevel)} />
            <Select label="Preferred lesson length" value={String(settings.lessonLength)} options={["15", "30", "45", "60"]} onChange={(value) => update({ lessonLength: Number(value) as UserSettings["lessonLength"] })} suffix=" minutes" />
            <Select label="Preferred focus" value={settings.preferredFocus} options={["balanced", "conversation", "vocabulary", "grammar", "reading", "speaking", "workplace Japanese"]} onChange={(value) => update({ preferredFocus: value as LessonFocus })} />
            <Select label="Reading difficulty" value={settings.readingDifficulty} options={["guided", "balanced", "independent"]} onChange={(value) => update({ readingDifficulty: value as UserSettings["readingDifficulty"] })} />
            <Select label="Speaking difficulty" value={settings.speakingDifficulty} options={["easy", "medium", "hard"]} onChange={(value) => update({ speakingDifficulty: value as UserSettings["speakingDifficulty"] })} />
          </div>
        </SettingsSection>

        <SettingsSection icon={Headphones} title="Audio" description="Control the frontend-only playback simulations.">
          <label className="block"><span className="flex justify-between text-sm font-semibold"><span>Simulated volume</span><span>{settings.audioVolume}%</span></span><input type="range" min={0} max={100} value={settings.audioVolume} onChange={(event) => update({ audioVolume: Number(event.target.value) })} className="mt-3 w-full accent-moss-600" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle label="Autoplay lesson audio" checked={settings.autoplay} onChange={(checked) => update({ autoplay: checked })} />
            <Toggle label="Show transcript after answer" checked={settings.showTranscript} onChange={(checked) => update({ showTranscript: checked })} />
            <Select label="Playback speed" value={String(settings.playbackSpeed)} options={["0.75", "1", "1.25"]} onChange={(value) => update({ playbackSpeed: Number(value) as UserSettings["playbackSpeed"] })} suffix="×" />
          </div>
        </SettingsSection>

        <SettingsSection icon={Mic2} title="Reading and speaking" description="Choose what mock learning evidence AIko should surface.">
          <div className="rounded-2xl bg-moss-50 p-4 text-sm leading-6 text-moss-900">“When you press Start Reading, AIko observes where you stop, what readings you reveal, and which meanings you open. This helps personalize future lessons.”</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Microphone permission" value={settings.microphonePermission} options={["not-asked", "allowed", "denied"]} onChange={(value) => update({ microphonePermission: value as UserSettings["microphonePermission"] })} />
            <Toggle label="Progressive reading highlights" checked={settings.readingHighlights} onChange={(checked) => update({ readingHighlights: checked })} />
            <Toggle label="Pronunciation feedback" checked={settings.pronunciationFeedback} onChange={(checked) => update({ pronunciationFeedback: checked })} />
          </div>
        </SettingsSection>

        <SettingsSection icon={Bell} title="Notifications" description="Mock notification preferences for the future product.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle label="Daily reminder" checked={settings.dailyReminder} onChange={(checked) => update({ dailyReminder: checked })} />
            <Toggle label="Review reminder" checked={settings.reviewReminder} onChange={(checked) => update({ reviewReminder: checked })} />
            <Toggle label="Streak reminder" checked={settings.streakReminder} onChange={(checked) => update({ streakReminder: checked })} />
            <Toggle label="Weekly report" checked={settings.weeklyReport} onChange={(checked) => update({ weeklyReport: checked })} />
            <Toggle label="Custom lesson ready" checked={settings.customLessonReady} onChange={(checked) => update({ customLessonReady: checked })} />
          </div>
        </SettingsSection>

        <SettingsSection icon={Palette} title="Appearance" description="The theme preference is persisted and applied across the app shell.">
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
            {(["light", "dark", "system"] as ThemePreference[]).map((theme) => <button key={theme} type="button" role="radio" aria-checked={settings.theme === theme} onClick={() => update({ theme })} className={`min-h-20 rounded-2xl border text-sm font-semibold capitalize focus:outline-none focus:ring-4 focus:ring-moss-100 ${settings.theme === theme ? "border-moss-600 bg-moss-50 text-moss-700" : "border-stone-200 bg-white"}`}>{theme}</button>)}
          </div>
        </SettingsSection>

        <SettingsSection icon={Shield} title="Privacy" description="Review, export, or reset the local prototype data.">
          <div className="rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">{getBackendMode() === "supabase" ? "Your export includes the server profile, settings, lesson sessions, completions, mastery, review data, reports, and support tickets." : `AIko currently stores one learner profile, ${progress.completedLessonIds.length} completed lesson IDs, ${progress.reviewQueue.length} review queue items, and settings locally.`}</div>
          <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={exportData}><Download className="size-4" /> Export learning data</Button><Button type="button" variant="secondary" onClick={() => setConfirm("reset")}><TriangleAlert className="size-4" /> Reset progress</Button><Button type="button" variant="ghost" className="text-persimmon-600" onClick={() => setConfirm("delete")}><Trash2 className="size-4" /> Delete account</Button></div>
          {exported && <p className="flex items-center gap-2 text-sm font-semibold text-moss-700" role="status"><Check className="size-4" /> Local data export prepared.</p>}
        </SettingsSection>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5" role="dialog" aria-modal="true" aria-labelledby="destructive-title">
          <div className="w-full max-w-md rounded-4xl bg-white p-7 shadow-float"><Trash2 className="size-8 text-persimmon-500" /><Badge tone="orange" className="mt-5">Confirmation required</Badge><h2 id="destructive-title" className="mt-4 text-2xl font-semibold">{confirm === "reset" ? "Reset learning progress?" : getBackendMode() === "supabase" ? "Account deletion is not available yet" : "Delete this mock account?"}</h2><p className="mt-3 text-sm leading-6 text-stone-500">{confirm === "reset" ? "Lessons, reviews, scores, mastery, rewards, and review history will be cleared. Your account and profile preferences remain." : getBackendMode() === "supabase" ? "A future privileged deletion workflow will remove the authentication account safely. You can export or reset progress now." : "All locally persisted AIko state will return to demo defaults."}</p><div className="mt-6 flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>{!(confirm === "delete" && getBackendMode() === "supabase") && <Button className="flex-1 bg-persimmon-500 hover:bg-persimmon-600" onClick={async () => { if (confirm === "reset") { if (getBackendMode() === "supabase") { const response = await fetch("/api/account/reset-progress", { method: "POST" }); if (!response.ok) return; } resetProgress(); } else resetDemo(); setConfirm(null); }}>{confirm === "reset" ? "Reset progress" : "Delete mock account"}</Button>}</div></div>
        </div>
      )}
    </div>
  );
}

function Select({ label, value, options, onChange, suffix = "" }: { label: string; value: string; options: string[]; onChange: (value: string) => void; suffix?: string }) {
  return <label><span className="mb-2 block text-sm font-semibold">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="form-input capitalize">{options.map((option) => <option key={option} value={option}>{option.replace("-", " ")}{suffix}</option>)}</select></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-stone-100 bg-white px-4"><span className="text-sm font-semibold">{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-moss-600" /></label>;
}
