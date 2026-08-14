import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { commuteLesson } from "@/data/mock-lessons";
import { calculateLessonCompletion } from "@/lib/scoring-utils";
import { storyLengthRange } from "@/lib/story-support";
import {
  selectNextAdaptiveQuestionIndex,
} from "@/lib/adaptive-difficulty";
import {
  japaneseInputPreview,
  romajiToHiragana,
  safeProductionPrompt,
} from "@/lib/japanese-input";
import { createEmptyLessonSession } from "@/store/app-store";
import type { LessonPackage } from "@/types/lesson";
import type { ExerciseDifficulty } from "@/types/lesson";

describe("learning engine contracts", () => {
  it("grows story length from 10–12 lines at N5 to 18–20 at N1", () => {
    expect(storyLengthRange("N5")).toEqual({ min: 10, max: 12 });
    expect(storyLengthRange("N3")).toEqual({ min: 14, max: 16 });
    expect(storyLengthRange("N1")).toEqual({ min: 18, max: 20 });
  });

  it("keeps seed lessons compatible with the canonical activity counts", () => {
    expect(commuteLesson.vocabularyQuestions).toHaveLength(13);
    expect(commuteLesson.grammarQuestions).toHaveLength(10);
    expect(
      commuteLesson.vocabularyQuestions.every(
        (question) => question.choices.includes(question.correctAnswer),
      ),
    ).toBe(true);
    expect(
      commuteLesson.grammarQuestions.every(
        (question) => question.choices.includes(question.correctAnswer),
      ),
    ).toBe(true);
  });

  it("serves five easy questions first and promotes a strong learner to three hard questions", () => {
    const questions = adaptiveBank();
    const answers: Array<{ questionId: string; correct: boolean }> = [];
    const served: ExerciseDifficulty[] = [];

    for (let index = 0; index < 10; index += 1) {
      const nextIndex = selectNextAdaptiveQuestionIndex(questions, answers, {
        targetCount: 10,
      });
      expect(nextIndex).not.toBeNull();
      const question = questions[nextIndex ?? 0];
      served.push(question.difficulty);
      answers.push({ questionId: question.id, correct: true });
    }

    expect(served.slice(0, 5)).toEqual([
      "Easy",
      "Easy",
      "Easy",
      "Easy",
      "Easy",
    ]);
    expect(served.filter((item) => item === "Medium")).toHaveLength(2);
    expect(served.filter((item) => item === "Hard")).toHaveLength(3);
    expect(served.at(-1)).toBe("Hard");
  });

  it("repeats medium after a miss and still reserves the last question for hard", () => {
    const questions = adaptiveBank();
    const answers: Array<{ questionId: string; correct: boolean }> = [];
    const served: ExerciseDifficulty[] = [];

    for (let index = 0; index < 10; index += 1) {
      const nextIndex = selectNextAdaptiveQuestionIndex(questions, answers, {
        targetCount: 10,
      });
      const question = questions[nextIndex ?? 0];
      served.push(question.difficulty);
      answers.push({
        questionId: question.id,
        correct: question.difficulty !== "Medium",
      });
    }

    expect(served.slice(0, 5).every((item) => item === "Easy")).toBe(true);
    expect(served.filter((item) => item === "Medium")).toHaveLength(4);
    expect(served.filter((item) => item === "Hard")).toHaveLength(1);
    expect(served.at(-1)).toBe("Hard");
  });

  it("converts romaji input without leaking the stored Japanese answer", () => {
    expect(romajiToHiragana("hana wa kirei datta")).toBe(
      "はな わ きれい だった",
    );
    expect(japaneseInputPreview("datta")).toBe("だった");
    expect(
      safeProductionPrompt(
        "Translate the ending: The flower was beautiful (plain). はなは きれい ___。",
        "はなは きれい だった。",
      ),
    ).toBe("Translate the ending: The flower was beautiful (plain).");
  });

  it("keeps adaptive candidate banks historical while current custom lessons use seven-question banks", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260727100000_adaptive_question_banks.sql",
      ),
      "utf8",
    );
    const activityGroups = readFileSync(
      resolve(process.cwd(), "lib/gemini/lesson-activity-groups.ts"),
      "utf8",
    );
    const vocabularyContract = readFileSync(
      resolve(process.cwd(), "lib/gemini/vocabulary-question-contract.ts"),
      "utf8",
    );
    const grammarContract = readFileSync(
      resolve(process.cwd(), "lib/gemini/grammar-question-contract.ts"),
      "utf8",
    );

    expect(migration).toContain(
      "jsonb_array_length(p_package->'vocabularyQuestions') not between 10 and 13",
    );
    expect(migration).toContain(
      "jsonb_array_length(p_package->'grammarQuestions') not between 10 and 13",
    );
    expect(vocabularyContract).toContain("3 easy, 2 medium, and 2 hard");
    expect(grammarContract).toContain("3 easy, 2 medium, and 2 hard");
    expect(activityGroups).toContain('name: "vocab_questions"');
    expect(activityGroups).toContain('name: "grammar_questions"');
  });

  it("keeps level completion tied to finite JLPT catalogs", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260727090000_learning_engine_v2.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("from public.kanji_catalog catalog");
    expect(migration).toContain("from public.grammar_catalog catalog");
    expect(migration).not.toContain("v_total_lessons");
    expect(migration).not.toMatch(/\bdrop\s+(table|schema|database)\b/i);
  });

  it("deduplicates hiragana and katakana through one normalized kana table", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260727092000_normalized_kana_library.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("create table public.kana_records");
    expect(migration).toContain("unique (normalized_value)");
    expect(migration).toContain("normalize(btrim(value), NFKC)");
    expect(migration).toContain("script_type in ('hiragana', 'katakana', 'mixed')");
    expect(migration).toContain("on conflict (normalized_value) do update");
    expect(migration).toContain("alter column kana_id set not null");
  });

  it("maps weak answers to the lesson library instead of demo terms", () => {
    const lesson: LessonPackage = {
      ...commuteLesson,
      kanji: commuteLesson.kanji.map((item, index) => ({
        ...item,
        libraryId: `kanji-${index}`,
      })),
      vocabulary: commuteLesson.vocabulary.map((item, index) => ({
        ...item,
        libraryId: `vocabulary-${index}`,
      })),
      grammar: commuteLesson.grammar.map((item, index) => ({
        ...item,
        libraryId: `grammar-${index}`,
      })),
      vocabularyQuestions: commuteLesson.vocabularyQuestions.map(
        (question, index) => ({
          ...question,
          targetItemIds: [`vocabulary-${index % commuteLesson.vocabulary.length}`],
        }),
      ),
      grammarQuestions: commuteLesson.grammarQuestions.map((question, index) => ({
        ...question,
        targetItemIds: [`grammar-${index % commuteLesson.grammar.length}`],
      })),
      reviewQuestions: commuteLesson.reviewQuestions.map((question) => ({
        ...question,
        targetItemIds: ["kanji-0"],
      })),
    };
    const session = createEmptyLessonSession(lesson.id);
    session.vocabularyAnswers = [{
      questionId: lesson.vocabularyQuestions[0].id,
      mode: lesson.vocabularyQuestions[0].mode,
      selectedAnswer: "wrong",
      correct: false,
      attempts: 1,
    }];
    session.grammarAnswers = [{
      questionId: lesson.grammarQuestions[0].id,
      type: lesson.grammarQuestions[0].type,
      selectedAnswer: "wrong",
      correct: false,
      skill: lesson.grammarQuestions[0].skill,
      attempts: 1,
    }];
    session.reviewAnswers = [{
      questionId: lesson.reviewQuestions[0].id,
      category: "kanji",
      selectedAnswer: "wrong",
      correct: false,
    }];

    expect(calculateLessonCompletion(lesson, session).wordsNeedingReview).toEqual([
      lesson.vocabulary[0].term,
      lesson.grammar[0].pattern,
      lesson.kanji[0].character,
    ]);
  });

  it("does not contain commute-specific player fallbacks", () => {
    const playerSources = [
      "components/lesson/reading-phase.tsx",
      "components/lesson/listening-phase.tsx",
      "components/lesson/speaking-phase.tsx",
      "components/exercises/speaking-feedback.tsx",
      "lib/scoring-utils.ts",
    ]
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");

    expect(playerSources).not.toContain("Morning at the station");
    expect(playerSources).not.toContain("Yuki met Tanaka");
    expect(playerSources).not.toContain("Mock evaluation");
    expect(playerSources).not.toContain('wordsNeedingReview : ["改札"]');
  });
});

function adaptiveBank(): Array<{
  id: string;
  difficulty: ExerciseDifficulty;
}> {
  return [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `easy-${index + 1}`,
      difficulty: "Easy" as const,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `medium-${index + 1}`,
      difficulty: "Medium" as const,
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `hard-${index + 1}`,
      difficulty: "Hard" as const,
    })),
  ];
}
