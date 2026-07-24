"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpenCheck, Crown, Search, Sparkles, WandSparkles } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { learnerVisibleLessons, mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { generateCustomLesson } from "@/lib/custom-lesson-utils";
import { buildLessonCardStates, matchCustomTopic } from "@/lib/lesson-search-utils";
import type { CustomLessonGenerationStage, CustomLessonMatch, LessonFocus } from "@/types/app-preferences";
import type { JLPTLevel } from "@/types/lesson";
import { useAppStore } from "@/store/app-store";
import { useAdminStore } from "@/store/admin-store";
import { LessonCard } from "@/components/learn/lesson-card";
import { GenerationProgress } from "@/components/custom-topic/generation-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const stages: CustomLessonGenerationStage[] = [
  "Understanding your topic",
  "Checking previous lessons",
  "Planning a new variation",
  "Creating lesson content",
  "Checking grammar and level",
  "Checking answers and exercises",
  "Adding lesson to the library",
  "Ready",
];

export function CustomTopicPage() {
  const subscription = useAppStore((state) => state.subscription);
  const generated = useAppStore((state) => state.generatedLessons);
  const overrides = useAdminStore((state) => state.lessonOverrides);
  const deletedLessonIds = useAdminStore((state) => state.deletedLessonIds);
  const completedIds = useAppStore((state) => state.progress.completedLessonIds);
  const sessions = useAppStore((state) => state.lessonSessions);
  const recentLessons = useAppStore((state) => state.progress.recentLessons);
  const savedIds = useAppStore((state) => state.savedLessonIds);
  const addGenerated = useAppStore((state) => state.addGeneratedLesson);
  const addRequest = useAppStore((state) => state.addCustomLessonRequest);
  const toggleSaved = useAppStore((state) => state.toggleSavedLesson);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<JLPTLevel>("N4");
  const [duration, setDuration] = useState<15 | 30 | 45 | 60>(30);
  const [focus, setFocus] = useState<LessonFocus>("balanced");
  const [speaking, setSpeaking] = useState<"easy" | "medium" | "hard">("medium");
  const [note, setNote] = useState("");
  const [match, setMatch] = useState<CustomLessonMatch | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [resultLessonId, setResultLessonId] = useState<string | null>(null);
  const allLessons = useMemo(
    () => learnerVisibleLessons(mergeCanonicalLessons(mockLessons, generated, overrides, deletedLessonIds)),
    [deletedLessonIds, generated, overrides],
  );
  const resultLesson = resultLessonId ? allLessons.find((lesson) => lesson.id === resultLessonId) : match?.outcome === "existing" ? match.lesson : undefined;
  const resultState = resultLesson ? buildLessonCardStates([resultLesson], savedIds, completedIds, sessions, recentLessons)[0] : null;

  useEffect(() => {
    if (!match || match.outcome === "existing" || resultLessonId) return;
    const timer = window.setInterval(() => {
      setStageIndex((current) => {
        if (current < stages.length - 1) return current + 1;
        const lesson = generateCustomLesson(
          { topic, level, durationMinutes: duration, focus, speakingDifficulty: speaking },
          generated.length + 1,
          match.lesson,
        );
        addGenerated(lesson);
        addRequest({
          id: `custom_request_${generated.length + 1}`,
          topic,
          level,
          durationMinutes: duration,
          focus,
          speakingDifficulty: speaking,
          note,
          outcome: match.outcome,
          matchedLessonId: match.lesson?.id,
          generatedLessonId: lesson.id,
          createdAt: "Just now",
        });
        setResultLessonId(lesson.id);
        window.clearInterval(timer);
        return current;
      });
    }, 520);
    return () => window.clearInterval(timer);
  }, [addGenerated, addRequest, duration, focus, generated.length, level, match, note, resultLessonId, speaking, topic]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = matchCustomTopic(topic, level, duration, focus, allLessons, completedIds);
    setMatch(next);
    setResultLessonId(next.outcome === "existing" ? next.lesson?.id ?? null : null);
    setStageIndex(0);
    if (next.outcome === "existing" && next.lesson) {
      addRequest({
        id: `custom_request_${generated.length + 1}`,
        topic,
        level,
        durationMinutes: duration,
        focus,
        speakingDifficulty: speaking,
        note,
        outcome: "existing",
        matchedLessonId: next.lesson.id,
        createdAt: "Just now",
      });
    }
  }

  if (subscription.plan !== "premium") {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <div className="overflow-hidden rounded-4xl bg-moss-900 p-8 text-white shadow-float sm:p-14">
          <Crown className="size-9 text-persimmon-400" />
          <Badge tone="orange" className="mt-7">Premium feature</Badge>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Turn your world into a structured lesson.</h1>
          <p className="mt-5 max-w-xl leading-7 text-white/65">AIko searches the lesson library first, then creates a validated variation only when needed. No live AI service is used in this prototype.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><ButtonLink href="/subscription" className="bg-persimmon-500 hover:bg-persimmon-600">See Premium plans</ButtonLink><ButtonLink href="/learn" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/15">Browse free lessons</ButtonLink></div>
          <p className="mt-5 text-xs text-white/40">Development tip: use the obvious demo plan switch on the subscription page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header><ButtonLink href="/learn" variant="ghost" className="px-0"><ArrowLeft className="size-4" /> Lesson library</ButtonLink><p className="section-kicker mt-6">Premium custom topic</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">What would you like to learn about?</h1><p className="mt-3 max-w-2xl text-stone-500">AIko checks compatible lessons before creating a deterministic, validated variation.</p></header>
      <div className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <Card className="p-6 sm:p-7">
          <form className="space-y-5" onSubmit={submit}>
            <Field label="Topic"><input required minLength={2} value={topic} onChange={(event) => setTopic(event.target.value)} className="form-input" placeholder="AI research, hospital visit, agriculture technology…" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="JLPT level"><select value={level} onChange={(event) => setLevel(event.target.value as JLPTLevel)} className="form-input">{["N5", "N4", "N3", "N2", "N1"].map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label="Lesson length"><select value={duration} onChange={(event) => setDuration(Number(event.target.value) as 15 | 30 | 45 | 60)} className="form-input">{[15, 30, 45, 60].map((item) => <option key={item} value={item}>{item} minutes</option>)}</select></Field>
              <Field label="Preferred focus"><select value={focus} onChange={(event) => setFocus(event.target.value as LessonFocus)} className="form-input">{["balanced", "conversation", "vocabulary", "grammar", "reading", "speaking", "workplace Japanese"].map((item) => <option key={item} className="capitalize">{item}</option>)}</select></Field>
              <Field label="Speaking difficulty"><select value={speaking} onChange={(event) => setSpeaking(event.target.value as "easy" | "medium" | "hard")} className="form-input">{["easy", "medium", "hard"].map((item) => <option key={item} className="capitalize">{item}</option>)}</select></Field>
            </div>
            <Field label="Optional note"><textarea value={note} onChange={(event) => setNote(event.target.value)} className="form-input min-h-28 resize-none py-3" placeholder="A situation, vocabulary preference, or learning need…" /></Field>
            <Button type="submit" className="w-full"><Search className="size-4" /> Find Lesson</Button>
          </form>
        </Card>

        <div>
          {!match ? (
            <div className="grid min-h-[34rem] place-items-center rounded-4xl border border-dashed border-moss-200 bg-white p-8 text-center">
              <div><WandSparkles className="mx-auto size-11 text-moss-300" /><h2 className="mt-5 text-xl font-semibold">Library-first matching</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">Try “IT support” to find an existing lesson, a completed topic such as “café,” or an unknown topic to see creation.</p></div>
            </div>
          ) : resultState ? (
            <div>
              <div className="mb-5 rounded-3xl bg-moss-50 p-5">
                <p className="flex items-center gap-2 font-semibold text-moss-900"><BookOpenCheck className="size-5" /> {match.outcome === "existing" ? "AIko found a lesson in the library." : match.outcome === "variation" ? "Your fresh variation is ready." : "Your new lesson is ready."}</p>
                <p className="mt-1 text-sm text-stone-500">Match confidence {match.score}% · checked for structure and playable phases</p>
              </div>
              <LessonCard state={resultState} onToggleSaved={toggleSaved} />
              <Button type="button" variant="ghost" className="mt-4" onClick={() => { setMatch(null); setResultLessonId(null); }}>Search Again</Button>
            </div>
          ) : (
            <Card className="p-6 sm:p-7">
              <div className="mb-6"><Badge tone="orange"><Sparkles className="mr-1 size-3" /> Creating locally</Badge><h2 className="mt-4 text-2xl font-semibold">{match.outcome === "variation" ? "You already completed the closest matching lesson. AIko is creating a fresh variation." : "AIko couldn’t find a suitable lesson, so a new one is being created."}</h2><p className="mt-2 text-sm leading-6 text-stone-500">A predefined template keeps the lesson structurally compatible with the complete player.</p></div>
              <GenerationProgress stages={stages} currentIndex={stageIndex} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span>{children}</label>;
}
