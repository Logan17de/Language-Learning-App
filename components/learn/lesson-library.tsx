"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Crown,
  Headphones,
  Languages,
  LoaderCircle,
  Mic2,
  Sparkles,
  WandSparkles,
  AlertTriangle,
} from "lucide-react";
import type { JLPTLevel } from "@/types/lesson";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { GenerationProgress } from "@/components/custom-topic/generation-progress";
import {
  lessonCreationRepository,
  type LessonCreationState,
} from "@/lib/repositories/lesson-creation-repository";
import { retirePreviousLessons } from "@/lib/sync/retire-previous-lessons";

type GenerationState = "idle" | "generating" | "error";

type GenerationResult = {
  requestId?: string;
  outcome?: string;
  status?: string;
  lesson_id?: string;
  error?: string;
  code?: string;
};

const openingStages = ["Writing your story", "Building six connected phases"];

export function LessonLibrary() {
  const router = useRouter();
  const onboarding = useAppStore((state) => state.onboarding);
  const user = useAppStore((state) => state.user);
  const [topic, setTopic] = useState("");
  // The learner's level comes from their profile and is earned, not chosen.
  // Manual selection is a per-lesson override only: it never rewrites the
  // profile level, which advances solely through earned promotion.
  const profileLevel = learnerLevel(onboarding.level ?? user.level);
  const [levelMode, setLevelMode] = useState<"automatic" | "manual">(
    "automatic",
  );
  const [manualLevel, setManualLevel] = useState<JLPTLevel>(profileLevel);
  const level = levelMode === "automatic" ? profileLevel : manualLevel;
  const [creationState, setCreationState] =
    useState<LessonCreationState | null>(null);
  const [showCreationForm, setShowCreationForm] = useState(false);
  const [loadingState, setLoadingState] = useState(true);
  const [state, setState] = useState<GenerationState>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void lessonCreationRepository.load().then((result) => {
      if (!active) return;
      setLoadingState(false);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCreationState(result.data);
      setShowCreationForm(!result.data.resumeLessonId);
      // Only seeds the manual override default. Automatic mode always
      // follows the profile level, which is earned rather than chosen.
      if (result.data.level) setManualLevel(result.data.level);
    });
    return () => {
      active = false;
    };
  }, []);

  async function reloadState() {
    setLoadingState(true);
    const result = await lessonCreationRepository.load();
    setLoadingState(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCreationState(result.data);
    setShowCreationForm((shown) => shown || !result.data.resumeLessonId);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creationState?.canCreate || state === "generating") return;

    setError("");
    setState("generating");

    try {
      const response = await fetch("/api/custom-lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, level }),
      });
      const result = (await response.json().catch(() => null)) as
        | GenerationResult
        | null;

      if (!response.ok) {
        setError(
          result?.error || "AIko could not create this lesson. Please try again.",
        );
        setState("error");
        await reloadState();
        return;
      }

      if (result?.lesson_id) {
        retirePreviousLessons(result.lesson_id);
        router.replace(`/lesson/${result.lesson_id}/play`);
        return;
      }

      if (!result?.requestId) {
        setError("The lesson request could not be started. Please try again.");
        setState("error");
        await reloadState();
        return;
      }

      router.replace(`/lesson/building/${encodeURIComponent(result.requestId)}`);
    } catch {
      setError(
        "The connection was interrupted while starting your lesson. Please try again.",
      );
      setState("error");
      await reloadState();
    }
  }

  const busy = state === "generating";
  const isFree = creationState?.plan === "free";
  const resumableLesson = resumeLessonAction(creationState);
  const currentLesson = currentLessonAction(creationState);
  const creationFormVisible = !resumableLesson || showCreationForm;

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="mx-auto max-w-3xl text-center">
        <p className="section-kicker">Learn</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Choose the topic. AIko builds the lesson.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted">
          Tell AIko what you want to learn through. Your level comes from your
          profile and rises as you master it, so every lesson is built as one
          connected story plus vocabulary, grammar, reading, listening, and
          speaking at the right difficulty.
        </p>
      </header>

      <section className="mt-9 grid gap-6 lg:grid-cols-[.95fr_1.05fr]">
        <Card className="p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Learn</p>
              <h2 className="mt-2 text-2xl font-semibold">
                Resume or start something new.
              </h2>
            </div>
            {creationState && (
              <Badge tone={isFree ? "moss" : "orange"}>
                {isFree ? "Free" : "Premium"}
              </Badge>
            )}
          </div>

          {loadingState ? (
            <div
              className="mt-8 flex min-h-56 items-center justify-center"
              role="status"
            >
              <div className="text-center">
                <LoaderCircle className="mx-auto size-7 animate-spin text-moss-700" />
                <p className="mt-3 text-sm font-semibold text-muted">
                  Checking today&apos;s lesson allowance…
                </p>
              </div>
            </div>
          ) : (
            <>
              {creationState && (
                <div className="mt-6 rounded-2xl bg-moss-50 px-4 py-4 text-sm leading-6 text-moss-900">
                  {isFree ? (
                    creationState.canCreate ? (
                      <>
                        <strong>1 free lesson available today.</strong> Resume is
                        separate from today&apos;s allowance, so an unfinished older
                        lesson never blocks this new slot.
                      </>
                    ) : (
                      <>
                        <strong>
                          Today&apos;s free lesson is already reserved or used.
                        </strong>{" "}
                        Resume remains available without consuming another lesson.
                      </>
                    )
                  ) : (
                    <>
                      <strong>
                        {Math.max(
                          0,
                          creationState.dailyLimit - creationState.creationsToday,
                        )}{" "}
                        creation
                        {creationState.dailyLimit - creationState.creationsToday ===
                        1
                          ? ""
                          : "s"}{" "}
                        remaining today.
                      </strong>{" "}
                      Unfinished lessons stay resumable and never use one of
                      these.
                    </>
                  )}
                  {creationState.timezone && (
                    <span className="mt-1 block text-xs text-moss-700">
                      Daily limits follow your learner timezone:{" "}
                      {creationState.timezone}.
                    </span>
                  )}
                </div>
              )}

              {resumableLesson && (
                <div className="mt-5 rounded-2xl border border-moss-300 bg-moss-50/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-moss-700">
                    Unfinished lesson
                  </p>
                  <p className="mt-2 font-semibold">
                    {creationState?.resumeTopic ?? "Your unfinished lesson"}
                    {creationState?.resumeLevel
                      ? ` · ${creationState.resumeLevel}`
                      : ""}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Completed phases stay saved. Your first unfinished phase
                    restarts from question 1, with partial answers discarded.
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <ButtonLink href={resumableLesson.href} className="sm:flex-1">
                      Resume lesson
                    </ButtonLink>
                    <Button
                      type="button"
                      variant="secondary"
                      className="sm:flex-1"
                      disabled={!creationState?.canCreate}
                      onClick={() => setShowCreationForm(true)}
                    >
                      Start new lesson
                    </Button>
                  </div>
                  {!creationState?.canCreate ? (
                    <p className="mt-3 text-xs font-semibold text-muted">
                      Today&apos;s creation limit is reached. Resume is still available.
                    </p>
                  ) : null}
                </div>
              )}

              {currentLesson && (
                <div className="mt-5 rounded-2xl border border-moss-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-moss-600">
                    {currentLesson.kicker}
                  </p>
                  <p className="mt-2 font-semibold">
                    {creationState?.topic ?? "Your custom lesson"}
                    {creationState?.level ? ` · ${creationState.level}` : ""}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {currentLesson.detail}
                  </p>
                  <ButtonLink
                    href={currentLesson.href}
                    variant="secondary"
                    className="mt-4"
                  >
                    {currentLesson.label}
                  </ButtonLink>
                </div>
              )}

              {creationFormVisible ? (
                <form className="mt-6 space-y-5" onSubmit={submit}>
                  <div>
                    <p className="section-kicker">Start new lesson</p>
                    <h3 className="mt-2 text-lg font-semibold">
                      What do you want to learn through?
                    </h3>
                  </div>
                  <Field label="Topic">
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      disabled={busy || creationState?.canCreate === false}
                      className="form-input disabled:cursor-not-allowed disabled:opacity-60"
                      placeholder="Ordering at an izakaya, my first day at work…"
                    />
                  </Field>
                  <Field label="Japanese level">
                    <Select
                      value={levelMode}
                      onChange={(event) =>
                        setLevelMode(
                          event.target.value as "automatic" | "manual",
                        )
                      }
                      disabled={busy || creationState?.canCreate === false}
                    >
                      <option value="automatic">
                        Automatic — your level ({profileLevel})
                      </option>
                      <option value="manual">Choose a different level</option>
                    </Select>
                  </Field>

                  {levelMode === "manual" && (
                    <Field label="Lesson level">
                      <Select
                        value={manualLevel}
                        onChange={(event) =>
                          setManualLevel(event.target.value as JLPTLevel)
                        }
                        disabled={busy || creationState?.canCreate === false}
                      >
                        {(["N5", "N4", "N3", "N2", "N1"] as JLPTLevel[]).map(
                          (item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ),
                        )}
                      </Select>
                      {levelDifficultyNote(profileLevel, manualLevel) && (
                        <p
                          role="status"
                          className="mt-2 flex gap-2 text-xs leading-5 text-amber-800"
                        >
                          <AlertTriangle
                            aria-hidden="true"
                            className="mt-0.5 size-3.5 shrink-0"
                          />
                          <span>
                            {levelDifficultyNote(profileLevel, manualLevel)}
                          </span>
                        </p>
                      )}
                    </Field>
                  )}

                  {error && (
                    <div
                      role="alert"
                      className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"
                    >
                      <p>{error}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 h-auto px-0 py-1 text-amber-900"
                        onClick={() => void reloadState()}
                      >
                        Retry allowance check
                      </Button>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={
                      busy ||
                      loadingState ||
                      !creationState?.canCreate ||
                      topic.trim().length < 2
                    }
                    className="w-full"
                  >
                    {busy ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <WandSparkles className="size-4" />
                    )}
                    {busy ? "Starting your lesson…" : "Start new lesson"}
                  </Button>
                  {creationState && !creationState.canCreate ? (
                    <p className="text-center text-xs font-semibold text-muted">
                      Daily creation limit reached. Resume remains available above.
                    </p>
                  ) : null}
                </form>
              ) : null}
            </>
          )}
        </Card>

        <Card className="min-h-[28rem] p-7 sm:p-9">
          {busy ? (
            <div role="status" aria-live="polite">
              <Badge tone="moss">Building your lesson</Badge>
              <h2 className="mt-4 text-2xl font-semibold">
                AIko is turning your topic into Japanese practice.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                The story is prepared first, then the same language is carried
                through every practice phase.
              </p>
              <div className="mt-7">
                <GenerationProgress stages={openingStages} currentIndex={0} />
              </div>
            </div>
          ) : (
            <div>
              <Badge tone="moss">Six connected phases</Badge>
              <h2 className="mt-4 text-2xl font-semibold">
                The lesson stays focused on the topic you asked for.
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Every lesson is built from one topic and runs as six connected
                phases, so the same language keeps coming back instead of
                jumping to something unrelated.
              </p>

              <div className="mt-7 space-y-5">
                <Feature
                  icon={BookOpen}
                  title="Story, then vocabulary and grammar"
                  detail="You read the story first, then practise the words and patterns it introduced."
                />
                <Feature
                  icon={Headphones}
                  title="Reading and listening"
                  detail="Meet the same language again in a passage and in spoken conversation."
                />
                <Feature
                  icon={Mic2}
                  title="Speaking"
                  detail="Finish by saying it yourself, so the lesson ends in production rather than recognition."
                />
                <Feature
                  icon={CheckCircle2}
                  title="Pick up where you left off"
                  detail="Finished phases stay finished, and coming back to an unfinished lesson never costs you a new one."
                />
              </div>

              {isFree && (
                <div className="mt-7 rounded-2xl border border-persimmon-200 bg-persimmon-50 p-4">
                  <div className="flex gap-3">
                    <Crown className="mt-0.5 size-5 shrink-0 text-persimmon-600" />
                    <div>
                      <p className="font-semibold text-persimmon-900">
                        Want more practice and more lessons?
                      </p>
                      <p className="mt-1 text-sm leading-6 text-persimmon-800">
                        Compare what each plan includes on the subscription
                        page.
                      </p>
                      <ButtonLink
                        href="/subscription"
                        variant="secondary"
                        className="mt-3"
                      >
                        See Premium
                      </ButtonLink>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function resumeLessonAction(state: LessonCreationState | null): {
  href: string;
} | null {
  if (!state?.resumeLessonId || !state.resumeLessonState) return null;
  return { href: `/lesson/${state.resumeLessonId}/play` };
}

function currentLessonAction(state: LessonCreationState | null): {
  href: string;
  label: string;
  kicker: string;
  detail: string;
} | null {
  if (!state?.lessonState) return null;
  if (
    state.lessonId &&
    state.lessonId === state.resumeLessonId &&
    (state.lessonState === "ready" || state.lessonState === "active")
  ) {
    return null;
  }
  if (state.lessonState === "building" && state.requestId) {
    return {
      href: `/lesson/building/${encodeURIComponent(state.requestId)}`,
      label: "Continue building",
      kicker: "Today&apos;s lesson is building",
      detail: "AIko is still building this lesson. Return to its progress screen anytime.",
    };
  }
  if (!state.lessonId) return null;
  if (state.lessonState === "active") return null;
  if (state.lessonState === "ready") {
    return {
      href: `/lesson/${state.lessonId}/play`,
      label: "Start lesson",
      kicker: "Today&apos;s lesson is ready",
      detail: "Your newly created lesson is ready to start.",
    };
  }
  if (state.lessonState === "completed") {
    return {
      href: `/lesson/${state.lessonId}/complete`,
      label: "View results",
      kicker: "Completed today",
      detail: "This lesson is complete. You can review its results without treating it as an active lesson.",
    };
  }
  return null;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function Feature({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Sparkles;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-50 text-moss-700">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
      </div>
    </div>
  );
}

const LEVEL_ORDER: readonly JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

/**
 * Warns when a per-lesson override differs from the learner's earned level.
 * Choosing above it is genuinely harder; choosing below it is easier, and the
 * generator picks those targets at random because the learner has usually
 * already mastered that level.
 */
function levelDifficultyNote(
  profile: JLPTLevel,
  chosen: JLPTLevel,
): string | null {
  const profileIndex = LEVEL_ORDER.indexOf(profile);
  const chosenIndex = LEVEL_ORDER.indexOf(chosen);
  if (profileIndex < 0 || chosenIndex < 0 || profileIndex === chosenIndex) {
    return null;
  }
  return chosenIndex > profileIndex
    ? `${chosen} is above your current level, so this lesson will be tougher than usual.`
    : `${chosen} is below your current level, so this lesson will be much easier and its practice is chosen at random.`;
}

function learnerLevel(level: string | null): JLPTLevel {
  return level === "N5" ||
    level === "N4" ||
    level === "N3" ||
    level === "N2" ||
    level === "N1"
    ? level
    : "N5";
}
