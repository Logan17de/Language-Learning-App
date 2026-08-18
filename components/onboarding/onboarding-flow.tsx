"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Clock3,
  Headphones,
  Languages,
  LoaderCircle,
  Map,
  Mic2,
  Plane,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/utils";
import { safePostOnboardingDestination } from "@/lib/auth/post-onboarding-destination";
import {
  clearOnboardingDraft,
  createOnboardingDraft,
  onboardingStepFromLocation,
  readOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/onboarding/onboarding-draft";
import { profileRepository } from "@/lib/repositories/profile-repository";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";
import type { DailyMinutes, LearnerLevel, LearningGoal } from "@/types/learner";

const TOTAL_STEPS = 6;

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

const levels: Array<{
  value: LearnerLevel;
  label: string;
  detail: string;
}> = [
  {
    value: "Beginner",
    label: "Beginner",
    detail: "I’m starting from the very beginning",
  },
  { value: "N5", label: "N5", detail: "I know basic phrases and simple sentences" },
  {
    value: "N4",
    label: "N4",
    detail: "I can understand familiar everyday Japanese",
  },
  { value: "N3", label: "N3", detail: "I can follow many daily conversations" },
  {
    value: "N2",
    label: "N2",
    detail: "I can understand Japanese in varied settings",
  },
  {
    value: "N1",
    label: "N1",
    detail: "I can understand advanced Japanese across many contexts",
  },
  {
    value: "Not sure",
    label: "Start me at the beginning",
    detail: "We’ll begin at N5 and adapt from there",
  },
];

function canonicalStartingLevel(level: LearnerLevel | null): LearnerLevel {
  return level === null || level === "Beginner" || level === "Not sure"
    ? "N5"
    : level;
}

export function OnboardingFlow() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const initializedUserRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [requestedNext, setRequestedNext] = useState<string | null>(null);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const {
    hasHydrated,
    backendSessionChecked,
    isAuthenticated,
    user,
    onboarding,
    setGoal,
    setLevel,
    setDailyMinutes,
    completeOnboarding,
    signIn,
  } = useAppStore();

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (!hasHydrated || !backendSessionChecked) return;

    const next = safePostOnboardingDestination(
      new URLSearchParams(window.location.search).get("next"),
    );
    setRequestedNext(next);

    if (!isAuthenticated) return;
    if (onboarding.completed) {
      router.replace(next ?? "/home");
      return;
    }
    if (!user.id || initializedUserRef.current === user.id) return;

    const stored = readOnboardingDraft(user.id) ?? createOnboardingDraft(user.name);
    const locationStep = onboardingStepFromLocation();
    const initialDraft: OnboardingDraft = {
      ...stored,
      displayName: stored.displayName.trim() ? stored.displayName : user.name,
      step: locationStep ?? stored.step,
    };
    initializedUserRef.current = user.id;
    setDraft(initialDraft);
    saveOnboardingDraft(user.id, initialDraft);

    const url = new URL(window.location.href);
    url.searchParams.set("step", String(initialDraft.step + 1));
    window.history.replaceState(
      {
        ...window.history.state,
        aikoOnboardingStep: initialDraft.step,
        aikoOnboardingHasPreviousStep: false,
      },
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [
    backendSessionChecked,
    hasHydrated,
    isAuthenticated,
    onboarding.completed,
    router,
    user.id,
    user.name,
  ]);

  useEffect(() => {
    if (!user.id) return;
    const handlePopState = () => {
      const step = onboardingStepFromLocation();
      if (step === null) return;
      setDraft((current) => {
        if (!current) return current;
        const next = { ...current, step };
        saveOnboardingDraft(user.id, next);
        return next;
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [user.id]);

  useEffect(() => {
    if (!draft) return;
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }, [draft?.step]);

  useEffect(() => {
    const main = mainRef.current;
    if (showSkipDialog) main?.setAttribute("inert", "");
    else main?.removeAttribute("inert");
    return () => main?.removeAttribute("inert");
  }, [showSkipDialog]);

  useEffect(() => {
    if (!showSkipDialog) return;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        event.preventDefault();
        setShowSkipDialog(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [showSkipDialog]);

  const step = draft?.step ?? 0;
  const canContinue = useMemo(() => {
    if (!draft) return false;
    if (step === 0) return Boolean(draft.displayName.trim());
    if (step === 1) return Boolean(draft.goal);
    if (step === 2) return Boolean(draft.level);
    if (step === 3) return Boolean(draft.dailyMinutes);
    return true;
  }, [draft, step]);

  function updateDraft(patch: Partial<OnboardingDraft>) {
    if (!user.id) return;
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      saveOnboardingDraft(user.id, next);
      return next;
    });
  }

  function writeStep(nextStep: number, mode: "push" | "replace") {
    const bounded = Math.max(0, Math.min(TOTAL_STEPS - 1, nextStep));
    updateDraft({ step: bounded });
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(bounded + 1));
    const state = {
      ...window.history.state,
      aikoOnboardingStep: bounded,
      aikoOnboardingHasPreviousStep:
        mode === "push"
          ? true
          : Boolean(window.history.state?.aikoOnboardingHasPreviousStep),
    };
    window.history[mode === "push" ? "pushState" : "replaceState"](
      state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function next() {
    if (!draft) return;
    if (step === 4) updateDraft({ speakingPracticeUnderstood: true });
    if (step === 5) {
      void finishOnboarding(requestedNext ?? "/learn");
      return;
    }
    writeStep(step + 1, "push");
  }

  function back() {
    if (step === 0 || saving) return;
    if (window.history.state?.aikoOnboardingHasPreviousStep) {
      window.history.back();
      return;
    }
    writeStep(step - 1, "replace");
  }

  function openSkipDialog() {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowSkipDialog(true);
  }

  function closeSkipDialog() {
    if (!saving) setShowSkipDialog(false);
  }

  async function finishOnboarding(destination?: string) {
    if (saving || !draft || !user.id) return;
    setSaving(true);
    setError("");

    const displayName = draft.displayName.trim() || user.name || "Learner";
    const selectedLevel = draft.level ?? "N5";
    const dailyMinutes = draft.dailyMinutes ?? 30;
    const canonicalLevel = canonicalStartingLevel(selectedLevel);
    const safeDestination =
      safePostOnboardingDestination(destination ?? requestedNext) ?? "/learn";

    let committed = {
      displayName,
      goal: draft.goal,
      level: canonicalLevel,
      dailyMinutes,
    };

    if (getBackendMode() === "supabase") {
      const result = await profileRepository.saveOnboarding({
        displayName,
        goal: draft.goal,
        level: selectedLevel,
        dailyMinutes,
      });
      if (!result.ok) {
        setSaving(false);
        setError(result.error.message);
        return;
      }
      committed = result.data;
    }

    if (committed.goal) setGoal(committed.goal);
    setLevel(committed.level);
    setDailyMinutes(committed.dailyMinutes);
    signIn(committed.displayName);
    completeOnboarding();
    clearOnboardingDraft(user.id);
    setShowSkipDialog(false);
    router.replace(safeDestination);
    router.refresh();
  }

  if (
    !hasHydrated ||
    !backendSessionChecked ||
    !isAuthenticated ||
    onboarding.completed ||
    !draft
  ) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5">
        <div className="text-center" aria-live="polite">
          <LoaderCircle className="mx-auto size-8 animate-spin text-moss-700" />
          <p className="mt-4 text-sm font-semibold text-stone-500">
            Preparing your learning path…
          </p>
        </div>
      </main>
    );
  }

  const startingLevel = canonicalStartingLevel(draft.level);

  return (
    <>
      <main ref={mainRef} className="min-h-screen bg-paper">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-6 sm:px-8">
          <Brand />
          <div className="flex items-center gap-2">
            {step < TOTAL_STEPS - 1 && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-10 px-3 text-xs sm:px-4 sm:text-sm"
                onClick={openSkipDialog}
              >
                Skip for now
              </Button>
            )}
            <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-stone-500 shadow-sm sm:px-4">
              Step {step + 1} of {TOTAL_STEPS}
            </span>
          </div>
        </header>
        <ProgressBar
          value={((step + 1) / TOTAL_STEPS) * 100}
          className="mx-auto h-1 max-w-6xl rounded-none bg-sand"
        />

        <div className="mx-auto flex min-h-[calc(100vh-110px)] max-w-3xl flex-col px-5 pb-8 pt-10 sm:px-8 sm:pt-14">
          <div className="flex-1 animate-fade-up" key={step}>
            {step === 0 && (
              <StepShell
                headingRef={headingRef}
                kicker="Your profile"
                title="What should AIko call you?"
                description="This name appears on your Home and Profile pages. You can change it later."
              >
                <div className="rounded-4xl bg-white p-6 shadow-card sm:p-8">
                  <span className="grid size-12 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                    <UserRound className="size-5" aria-hidden="true" />
                  </span>
                  <label className="mt-6 block">
                    <span className="mb-2 block text-sm font-semibold">
                      Display name
                    </span>
                    <input
                      required
                      value={draft.displayName}
                      onChange={(event) =>
                        updateDraft({ displayName: event.target.value.slice(0, 60) })
                      }
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
                headingRef={headingRef}
                kicker="Your direction"
                title="What brings you to Japanese?"
                description="Choose the goal that matters most right now. You can change this later."
              >
                <fieldset>
                  <legend className="sr-only">Primary learning goal</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {goals.map(({ value, detail, icon: Icon }) => (
                      <ChoiceCard
                        key={value}
                        name="learning-goal"
                        value={value}
                        selected={draft.goal === value}
                        onChange={() => updateDraft({ goal: value })}
                      >
                        <Icon className="size-5 text-moss-600" aria-hidden="true" />
                        <span className="block font-semibold">{value}</span>
                        <span className="mt-1 block text-xs leading-5 text-stone-500">
                          {detail}
                        </span>
                      </ChoiceCard>
                    ))}
                  </div>
                </fieldset>
              </StepShell>
            )}

            {step === 2 && (
              <StepShell
                headingRef={headingRef}
                kicker="Your starting point"
                title="Where are you now?"
                description="A rough answer is enough. AIko uses it to choose the level of lessons you see first."
              >
                <fieldset>
                  <legend className="sr-only">Starting Japanese level</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {levels.map(({ value, label, detail }) => (
                      <ChoiceCard
                        key={value}
                        name="starting-level"
                        value={value}
                        selected={draft.level === value}
                        onChange={() => updateDraft({ level: value })}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{label}</span>
                          {draft.level === value && (
                            <Check className="size-4 text-moss-600" aria-hidden="true" />
                          )}
                        </div>
                        <span className="mt-2 block text-xs leading-5 text-stone-500">
                          {detail}
                        </span>
                      </ChoiceCard>
                    ))}
                  </div>
                </fieldset>
              </StepShell>
            )}

            {step === 3 && (
              <StepShell
                headingRef={headingRef}
                kicker="Your rhythm"
                title="How much time feels realistic?"
                description="Choose a daily study target. This tracks your overall study time; it is not a promised lesson duration."
              >
                <fieldset>
                  <legend className="sr-only">Daily study target</legend>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {([15, 30, 45, 60] as DailyMinutes[]).map((minutes) => (
                      <label
                        key={minutes}
                        className={cn(
                          "min-h-36 cursor-pointer rounded-3xl border bg-white p-5 text-left transition focus-within:ring-4 focus-within:ring-moss-100",
                          draft.dailyMinutes === minutes
                            ? "border-moss-600 shadow-card"
                            : "border-black/[.06] hover:border-moss-200",
                        )}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name="daily-study-target"
                          value={minutes}
                          checked={draft.dailyMinutes === minutes}
                          onChange={() => updateDraft({ dailyMinutes: minutes })}
                        />
                        <Clock3
                          className={cn(
                            "size-5",
                            draft.dailyMinutes === minutes
                              ? "text-moss-600"
                              : "text-stone-400",
                          )}
                          aria-hidden="true"
                        />
                        <span className="mt-7 block text-3xl font-semibold">
                          {minutes}
                        </span>
                        <span className="text-xs text-stone-500">
                          minutes / day
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </StepShell>
            )}

            {step === 4 && (
              <StepShell
                headingRef={headingRef}
                kicker="Speaking practice"
                title="You’ll use the language out loud, too."
                description="When you start a speaking activity, AIko asks for microphone access, transcribes what you say, and compares it with the practice sentence."
              >
                <div className="relative overflow-hidden rounded-4xl bg-moss-900 p-8 text-white sm:p-12">
                  <div className="absolute -right-12 -top-12 size-48 rounded-full bg-persimmon-400/20 blur-2xl" />
                  <span className="relative grid size-16 place-items-center rounded-3xl bg-white/10">
                    <Mic2 className="size-7 text-persimmon-400" aria-hidden="true" />
                  </span>
                  <p className="relative mt-8 text-xl font-medium leading-8">
                    “Speaking comes after you’ve already met the same Japanese in the story and practice phases, so you’re not starting from zero.”
                  </p>
                  <div className="relative mt-8 grid gap-3 text-sm text-white/70 sm:grid-cols-3">
                    {[
                      "Microphone starts only when you record",
                      "Up to 10 seconds per attempt",
                      "Live transcript + sentence match",
                    ].map((item) => (
                      <span key={item} className="flex items-center gap-2">
                        <Check className="size-4 text-moss-200" aria-hidden="true" />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </StepShell>
            )}

            {step === 5 && (
              <div className="mx-auto max-w-xl py-8 text-center">
                <span className="mx-auto grid size-20 place-items-center rounded-[2rem] bg-persimmon-100 text-persimmon-500">
                  <Sparkles className="size-9" aria-hidden="true" />
                </span>
                <p className="section-kicker mt-8">Your path is ready</p>
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="mt-4 text-4xl font-semibold tracking-tight outline-none sm:text-5xl"
                >
                  AIko will take it from here.
                </h1>
                <p className="mx-auto mt-5 max-w-lg leading-7 text-stone-500">
                  Your daily goal is {draft.dailyMinutes} minutes. AIko will start you at {startingLevel}, then reuse each lesson story across vocabulary + kanji, grammar, reading, listening, and speaking.
                </p>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-stone-500">
                  What you do inside each lesson updates mastery and progress automatically, so later lessons can keep focusing on what still needs practice.
                </p>
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
                onClick={back}
                disabled={step === 0 || saving}
              >
                <ArrowLeft className="size-4" aria-hidden="true" /> Back
              </Button>
              <Button onClick={next} disabled={!canContinue || saving}>
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                {saving
                  ? "Saving…"
                  : step === 5
                    ? "Go to my learning path"
                    : step === 4
                      ? "I understand"
                      : "Continue"}
                {!saving && <ArrowRight className="size-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </div>
      </main>

      {showSkipDialog && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-moss-950/45 px-5 py-8 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSkipDialog();
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-profile-title"
            aria-describedby="skip-profile-description"
            className="w-full max-w-lg rounded-4xl bg-white p-7 shadow-2xl sm:p-9"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-moss-100 text-moss-700">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <h2 id="skip-profile-title" className="mt-5 text-2xl font-semibold">
              Complete your profile later?
            </h2>
            <p id="skip-profile-description" className="mt-3 leading-7 text-stone-500">
              You can skip now and update your learning goal, level, and daily study target any time from Profile.
            </p>
            <div className="mt-5 rounded-2xl bg-sand/70 p-4 text-sm leading-6 text-stone-600">
              AIko will keep anything you already chose. If you haven’t picked a starting level or daily target yet, we’ll start at N5 with a 30-minute daily target. You can change both later.
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
                onClick={closeSkipDialog}
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
    </>
  );
}

function StepShell({
  headingRef,
  kicker,
  title,
  description,
  children,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  kicker: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="section-kicker">{kicker}</p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-4xl font-semibold tracking-tight outline-none sm:text-5xl"
      >
        {title}
      </h1>
      <p className="mt-4 max-w-xl leading-7 text-stone-500">{description}</p>
      <div className="mt-9">{children}</div>
    </>
  );
}

function ChoiceCard({
  name,
  value,
  selected,
  onChange,
  children,
}: {
  name: string;
  value: string;
  selected: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "min-h-28 cursor-pointer rounded-3xl border bg-white p-5 text-left transition focus-within:ring-4 focus-within:ring-moss-100",
        selected
          ? "border-moss-600 shadow-card"
          : "border-black/[.06] hover:-translate-y-0.5 hover:border-moss-200 hover:shadow-card",
      )}
    >
      <input
        className="sr-only"
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onChange}
      />
      {children}
    </label>
  );
}
