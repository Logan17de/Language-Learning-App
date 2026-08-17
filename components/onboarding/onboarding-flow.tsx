"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CircleHelp,
  Clock3,
  Compass,
  Headphones,
  Languages,
  LoaderCircle,
  Map,
  Mic2,
  PartyPopper,
  Plane,
  Sparkles,
  Target,
  UserRound,
  Utensils,
} from "lucide-react";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/utils";
import { profileRepository } from "@/lib/repositories/profile-repository";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";
import type { DailyMinutes, LearnerLevel, LearningGoal } from "@/types/learner";

const goals: Array<{
  value: LearningGoal;
  detail: string;
  icon: typeof Target;
}> = [
  {
    value: "JLPT preparation",
    detail: "Build confidence for your next exam",
    icon: Languages,
  },
  {
    value: "Conversation",
    detail: "Speak more naturally in real situations",
    icon: Headphones,
  },
  {
    value: "Workplace Japanese",
    detail: "Communicate clearly with colleagues",
    icon: BriefcaseBusiness,
  },
  {
    value: "Daily life in Japan",
    detail: "Handle everyday moments with ease",
    icon: Map,
  },
  {
    value: "Travel",
    detail: "Connect and navigate on your trips",
    icon: Plane,
  },
];

const levels: Array<{ value: LearnerLevel; detail: string }> = [
  { value: "Beginner", detail: "I’m starting from the very beginning" },
  { value: "N5", detail: "I know basic phrases and simple sentences" },
  { value: "N4", detail: "I can understand familiar everyday Japanese" },
  { value: "N3", detail: "I can follow many daily conversations" },
  { value: "N2", detail: "I can understand Japanese in varied settings" },
  { value: "Not sure", detail: "Help me find the right starting point" },
];

const interests = [
  { name: "Daily life", icon: Compass },
  { name: "Technology", icon: Sparkles },
  { name: "Anime", icon: PartyPopper },
  { name: "Work", icon: BriefcaseBusiness },
  { name: "Travel", icon: Plane },
  { name: "Food", icon: Utensils },
  { name: "AI", icon: CircleHelp },
];

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [customInterest, setCustomInterest] = useState("");
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const {
    user,
    onboarding,
    subscription,
    setGoal,
    setLevel,
    setDailyMinutes,
    setInterests,
    acknowledgeReading,
    completeOnboarding,
    signIn,
  } = useAppStore();
  const isPro = subscription.plan === "premium";

  useEffect(() => {
    setName((current) =>
      current || (user.name === "Hana" ? "" : user.name),
    );
  }, [user.name]);

  const totalSteps = 7;
  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(name.trim());
    if (step === 1) return Boolean(onboarding.goal);
    if (step === 2) return Boolean(onboarding.level);
    if (step === 3) return Boolean(onboarding.dailyMinutes);
    return true;
  }, [name, step, onboarding]);

  function next() {
    if (step === 5) acknowledgeReading();
    if (step === 6) {
      void finishOnboarding("/learn");
      return;
    }
    setStep((current) => Math.min(totalSteps - 1, current + 1));
  }

  async function finishOnboarding(destination = "/home") {
    if (saving) return;
    setSaving(true);
    setError("");

    const displayName = name.trim() || user.name || "Learner";

    if (getBackendMode() === "supabase") {
      const result = await profileRepository.saveOnboarding({
        ...onboarding,
        displayName,
      });
      if (!result.ok) {
        setSaving(false);
        setError(result.error.message);
        return;
      }
    }

    signIn(displayName);
    completeOnboarding();
    router.push(destination);
  }

  function toggleInterest(interest: string) {
    setInterests(
      onboarding.interests.includes(interest)
        ? onboarding.interests.filter((item) => item !== interest)
        : [...onboarding.interests, interest],
    );
  }

  function addCustomInterest() {
    const interest = customInterest.trim();
    if (!interest || onboarding.interests.includes(interest)) return;
    setInterests([...onboarding.interests, interest]);
    setCustomInterest("");
  }

  const interestDescription = isPro
    ? "Pro uses these interests to rank level-matched lessons and personalize future content. You can also continue without them."
    : "You can save interests to your profile now, but Free lesson selection stays random within your level. Interest-based recommendations are a Pro feature.";

  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-6 sm:px-8">
        <Brand />
        <div className="flex items-center gap-2">
          {step < totalSteps - 1 && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-10 px-3 text-xs sm:px-4 sm:text-sm"
              onClick={() => setShowSkipDialog(true)}
            >
              Skip for now
            </Button>
          )}
          <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-stone-500 shadow-sm sm:px-4">
            Step {step + 1} of {totalSteps}
          </span>
        </div>
      </header>
      <ProgressBar
        value={((step + 1) / totalSteps) * 100}
        className="mx-auto h-1 max-w-6xl rounded-none bg-sand"
      />

      <div className="mx-auto flex min-h-[calc(100vh-110px)] max-w-3xl flex-col px-5 pb-8 pt-10 sm:px-8 sm:pt-14">
        <div className="flex-1 animate-fade-up" key={step}>
          {step === 0 && (
            <StepShell
              kicker="Your profile"
              title="What should AIko call you?"
              description="This name appears on your Home and Profile pages. You can change it later."
            >
              <div className="rounded-4xl bg-white p-6 shadow-card sm:p-8">
                <span className="grid size-12 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                  <UserRound className="size-5" />
                </span>
                <label className="mt-6 block">
                  <span className="mb-2 block text-sm font-semibold">
                    Display name
                  </span>
                  <input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="form-input"
                    placeholder="Your name"
                    autoComplete="name"
                    maxLength={60}
                  />
                </label>
              </div>
            </StepShell>
          )}

          {step === 1 && (
            <StepShell
              kicker="Your direction"
              title="What brings you to Japanese?"
              description="Choose the goal that matters most right now. You can change this later."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {goals.map(({ value, detail, icon: Icon }) => (
                  <ChoiceCard
                    key={value}
                    selected={onboarding.goal === value}
                    onClick={() => setGoal(value)}
                  >
                    <Icon className="size-5 text-moss-600" />
                    <span className="block font-semibold">{value}</span>
                    <span className="mt-1 block text-xs leading-5 text-stone-500">
                      {detail}
                    </span>
                  </ChoiceCard>
                ))}
              </div>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              kicker="Your starting point"
              title="Where are you now?"
              description="A rough answer is enough. AIko uses it to choose the level of lessons you see first."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {levels.map(({ value, detail }) => (
                  <ChoiceCard
                    key={value}
                    selected={onboarding.level === value}
                    onClick={() => setLevel(value)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{value}</span>
                      {onboarding.level === value && (
                        <Check className="size-4 text-moss-600" />
                      )}
                    </div>
                    <span className="mt-2 block text-xs leading-5 text-stone-500">
                      {detail}
                    </span>
                  </ChoiceCard>
                ))}
              </div>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell
              kicker="Your rhythm"
              title="How much time feels realistic?"
              description="Choose a daily study target. This tracks your overall study time; it is not a promised lesson duration."
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([15, 30, 45, 60] as DailyMinutes[]).map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => setDailyMinutes(minutes)}
                    className={cn(
                      "min-h-36 rounded-3xl border bg-white p-5 text-left transition focus:outline-none focus:ring-4 focus:ring-moss-100",
                      onboarding.dailyMinutes === minutes
                        ? "border-moss-600 shadow-card"
                        : "border-black/[.06] hover:border-moss-200",
                    )}
                  >
                    <Clock3
                      className={cn(
                        "size-5",
                        onboarding.dailyMinutes === minutes
                          ? "text-moss-600"
                          : "text-stone-300",
                      )}
                    />
                    <span className="mt-7 block text-3xl font-semibold">
                      {minutes}
                    </span>
                    <span className="text-xs text-stone-500">
                      minutes / day
                    </span>
                  </button>
                ))}
              </div>
            </StepShell>
          )}

          {step === 4 && (
            <StepShell
              kicker="Make it relevant"
              title="What do you enjoy talking about?"
              description={interestDescription}
            >
              <div className="mb-7 rounded-2xl border border-moss-100 bg-moss-50/70 px-4 py-3 text-sm leading-6 text-moss-800">
                {isPro
                  ? "No interests yet? You can continue. AIko will use random level-matched lessons until you add them."
                  : "Free tier: adding interests saves them to your profile, but it does not change lesson selection."}
              </div>
              <div className="flex flex-wrap gap-3">
                {interests.map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    onClick={() => toggleInterest(name)}
                    className={cn(
                      "inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-sm font-semibold transition",
                      onboarding.interests.includes(name)
                        ? "border-moss-600 bg-moss-600 text-white"
                        : "border-stone-200 bg-white text-stone-600 hover:border-moss-300",
                    )}
                  >
                    <Icon className="size-4" />
                    {name}
                  </button>
                ))}
                {onboarding.interests
                  .filter(
                    (item) =>
                      !interests.some((interest) => interest.name === item),
                  )
                  .map((item) => (
                    <button
                      key={item}
                      onClick={() => toggleInterest(item)}
                      className="inline-flex min-h-12 items-center gap-2 rounded-full border border-moss-600 bg-moss-600 px-5 text-sm font-semibold text-white"
                    >
                      <Check className="size-4" />
                      {item}
                    </button>
                  ))}
              </div>
              <div className="mt-7 flex gap-2">
                <input
                  value={customInterest}
                  onChange={(event) => setCustomInterest(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomInterest();
                    }
                  }}
                  className="form-input"
                  placeholder="Add your own interest…"
                  aria-label="Custom interest"
                />
                <Button
                  type="button"
                  onClick={addCustomInterest}
                  variant="secondary"
                  className="shrink-0 px-5"
                >
                  Add
                </Button>
              </div>
            </StepShell>
          )}

          {step === 5 && (
            <StepShell
              kicker="Speaking practice"
              title="You’ll use the language out loud, too."
              description="When you start a speaking activity, AIko asks for microphone access, transcribes what you say, and compares it with the practice sentence."
            >
              <div className="relative overflow-hidden rounded-4xl bg-moss-900 p-8 text-white sm:p-12">
                <div className="absolute -right-12 -top-12 size-48 rounded-full bg-persimmon-400/20 blur-2xl" />
                <span className="relative grid size-16 place-items-center rounded-3xl bg-white/10">
                  <Mic2 className="size-7 text-persimmon-400" />
                </span>
                <p className="relative mt-8 text-xl font-medium leading-8">
                  “Speaking comes after you’ve already met the same Japanese in the story and practice phases, so you’re not starting from zero.”
                </p>
                <div className="relative mt-8 grid gap-3 text-sm text-white/65 sm:grid-cols-3">
                  {[
                    "Microphone starts only when you record",
                    "Up to 10 seconds per attempt",
                    "Live transcript + sentence match",
                  ].map((item) => (
                    <span key={item} className="flex items-center gap-2">
                      <Check className="size-4 text-moss-200" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </StepShell>
          )}

          {step === 6 && (
            <div className="mx-auto max-w-xl py-8 text-center">
              <span className="mx-auto grid size-20 place-items-center rounded-[2rem] bg-persimmon-100 text-persimmon-500">
                <Sparkles className="size-9" />
              </span>
              <p className="section-kicker mt-8">Your path is ready</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                AIko will take it from here.
              </h1>
              <p className="mx-auto mt-5 max-w-lg leading-7 text-stone-500">
                Your daily goal is {onboarding.dailyMinutes} minutes. AIko will start you with a lesson at your starting level, then reuse its story across vocabulary + kanji, grammar, reading, listening, and speaking.
              </p>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-stone-500">
                {isPro
                  ? onboarding.interests.length
                    ? "Your interests help rank suitable lessons. What you do inside each lesson updates mastery and progress automatically."
                    : "Add interests later to enable Pro interest-based recommendations. What you do inside each lesson still updates mastery and progress automatically."
                  : "Free lessons are selected randomly within your level. What you do inside each lesson updates mastery and progress automatically."}
              </p>
              {onboarding.interests.length > 0 && (
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  {onboarding.interests.map((interest) => (
                    <span
                      key={interest}
                      className="rounded-full bg-moss-100 px-3 py-1.5 text-xs font-semibold text-moss-700"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-10 border-t border-black/[.06] pt-6">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || saving}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button onClick={next} disabled={!canContinue || saving}>
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              {saving
                ? "Saving…"
                : step === 6
                  ? "See my first lesson"
                  : step === 5
                    ? "I understand"
                    : step === 4 && onboarding.interests.length === 0
                      ? "Continue without interests"
                      : "Continue"}
              {!saving && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      {showSkipDialog && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-moss-950/45 px-5 py-8 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setShowSkipDialog(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-profile-title"
            className="w-full max-w-lg rounded-4xl bg-white p-7 shadow-2xl sm:p-9"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-moss-100 text-moss-700">
              <Sparkles className="size-5" />
            </span>
            <h2 id="skip-profile-title" className="mt-5 text-2xl font-semibold">
              Complete your profile later?
            </h2>
            <p className="mt-3 leading-7 text-stone-500">
              You can skip now and finish your learning profile any time from
              Profile.
            </p>
            <div className="mt-5 rounded-2xl bg-sand/70 p-4 text-sm leading-6 text-stone-600">
              {isPro ? (
                <>
                  <strong className="text-ink">Pro plan:</strong> without
                  interests, AIko will show random lessons at your level.
                  Interest-based recommendations and content generation begin
                  after you add your interests.
                </>
              ) : (
                <>
                  <strong className="text-ink">Free plan:</strong> lessons are
                  selected randomly at your level, even if interests are added.
                  Interest-based recommendations are a Pro feature.
                </>
              )}
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
              >
                {error}
              </p>
            )}
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowSkipDialog(false)}
                disabled={saving}
              >
                Keep setting up
              </Button>
              <Button
                type="button"
                onClick={() => void finishOnboarding()}
                disabled={saving}
              >
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                {saving ? "Saving…" : "Skip for now"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function StepShell({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="section-kicker">{kicker}</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-xl leading-7 text-stone-500">{description}</p>
      <div className="mt-9">{children}</div>
    </>
  );
}

function ChoiceCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-28 rounded-3xl border bg-white p-5 text-left transition focus:outline-none focus:ring-4 focus:ring-moss-100",
        selected
          ? "border-moss-600 shadow-card"
          : "border-black/[.06] hover:-translate-y-0.5 hover:border-moss-200 hover:shadow-card",
      )}
    >
      {children}
    </button>
  );
}
