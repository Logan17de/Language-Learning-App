"use client";

import { Brain, Languages, Target } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { useAppStore } from "@/store/app-store";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { JLPTLevel } from "@/types/lesson";

const levels: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

export function ProgressDashboard() {
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const generatedLessons = useAppStore((state) => state.generatedLessons);
  const allLessons = [
    ...generatedLessons,
    ...mockLessons.filter(
      (lesson) => !generatedLessons.some((item) => item.id === lesson.id),
    ),
  ];

  const completedLessons = allLessons.filter((lesson) =>
    progress.completedLessonIds.includes(lesson.id),
  );
  const learnedVocabulary = new Set(
    completedLessons.flatMap((lesson) =>
      lesson.vocabulary.map((item) => item.term),
    ),
  ).size;
  const learnedKanji = new Set(
    completedLessons.flatMap((lesson) =>
      lesson.kanji.map((item) => item.character),
    ),
  ).size;
  const learnedGrammar = new Set(
    completedLessons.flatMap((lesson) =>
      lesson.grammar.map((item) => item.pattern),
    ),
  ).size;

  const levelCompletion = (level: JLPTLevel) => {
    const lessons = allLessons.filter((lesson) => lesson.level === level);
    if (!lessons.length) return 0;
    return Math.round(
      lessons.reduce((total, lesson) => {
        if (progress.completedLessonIds.includes(lesson.id)) return total + 100;
        return total + (progress.lessonProgress[lesson.id] ?? 0);
      }, 0) / lessons.length,
    );
  };

  const currentLevel = levels.includes(user.level as JLPTLevel)
    ? (user.level as JLPTLevel)
    : "N5";
  const currentLevelCompletion = levelCompletion(currentLevel);
  const mastery = [
    ["Kanji recognition", progress.kanjiRecognition],
    ["Vocabulary recognition", vocabularyMastery(progress)],
    ["Grammar understanding", progress.grammarUnderstanding],
    ["Grammar production", progress.grammarProduction],
    ["Listening", progress.listeningConfidence],
    ["Speaking", progress.speakingConfidence],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header>
        <p className="section-kicker">Progress</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          See what you have completed.
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-500">
          Your level completion and the language you have learned from finished
          lessons.
        </p>
      </header>

      <Card className="mt-8 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
          <Ring
            value={currentLevelCompletion}
            label={currentLevel}
          />
          <div>
            <div className="flex items-center gap-3">
              <Target className="size-5 text-moss-600" />
              <div>
                <h2 className="text-2xl font-semibold">
                  {currentLevel} level completion
                </h2>
                <p className="mt-1 text-sm text-stone-400">
                  {currentLevelCompletion}% of the available {currentLevel} path
                </p>
              </div>
            </div>
            <ProgressBar value={currentLevelCompletion} className="mt-6" />
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <LearnedStat value={learnedVocabulary} label="vocabulary learned" />
              <LearnedStat value={learnedKanji} label="kanji learned" />
              <LearnedStat value={learnedGrammar} label="grammar learned" />
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <Languages className="size-5 text-persimmon-500" />
            <div>
              <h2 className="text-xl font-semibold">Level path</h2>
              <p className="text-sm text-stone-400">
                Completion across JLPT levels
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-5">
            {levels.map((level) => (
              <LevelProgress
                key={level}
                level={level}
                value={levelCompletion(level)}
                current={level === currentLevel}
              />
            ))}
          </div>
        </Card>

        <Card className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <Brain className="size-5 text-moss-600" />
            <div>
              <h2 className="text-xl font-semibold">Skill mastery</h2>
              <p className="text-sm text-stone-400">
                Estimated from lesson and review results
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-5">
            {mastery.map(([label, value]) => (
              <Metric key={label} label={label} value={value} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function vocabularyMastery(
  progress: ReturnType<typeof useAppStore.getState>["progress"],
) {
  if (!progress.weakVocabulary.length) return 100;
  return Math.round(
    progress.weakVocabulary.reduce(
      (sum, item) => sum + item.mastery,
      0,
    ) / progress.weakVocabulary.length,
  );
}

function LearnedStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-moss-50 p-4">
      <p className="text-3xl font-semibold text-moss-800">{value}</p>
      <p className="mt-1 text-xs text-stone-500">{label}</p>
    </div>
  );
}

function LevelProgress({
  level,
  value,
  current,
}: {
  level: JLPTLevel;
  value: number;
  current: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className={current ? "font-bold text-moss-700" : "font-semibold"}>
          {level}
          {current ? " · current" : ""}
        </span>
        <span className="text-stone-400">{value}%</span>
      </div>
      <ProgressBar
        value={value}
        barClassName={current ? "bg-persimmon-500" : undefined}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className="text-stone-400">{value}%</span>
      </div>
      <ProgressBar value={value} />
    </div>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="mx-auto grid size-36 place-items-center rounded-full"
      style={{
        background:
          "conic-gradient(#4f8068 " +
          value * 3.6 +
          "deg, #e2eee7 0)",
      }}
      role="img"
      aria-label={label + " curriculum " + value + "% complete"}
    >
      <div className="grid size-28 place-items-center rounded-full bg-white text-center">
        <span>
          <strong className="block text-3xl">{value}%</strong>
          <span className="text-xs font-semibold text-stone-400">{label}</span>
        </span>
      </div>
    </div>
  );
}
