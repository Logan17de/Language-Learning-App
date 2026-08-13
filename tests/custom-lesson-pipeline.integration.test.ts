import { describe, expect, it } from "vitest";
import {
  ACTIVITY_GROUPS,
  inspectPersistedActivityCheckpoints,
  playableLessonPackageIssues,
} from "@/lib/custom-lessons/checkpoint-validation";

describe("durable custom lesson pipeline integration model", () => {
  it("covers story tappability through the three teaching groups and saved lesson", () => {
    const ids = Array.from({ length: 8 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const validIds = new Set(ids);
    const sevenDifficulty = (index: number) =>
      index < 3 ? "Easy" as const : index < 5 ? "Medium" as const : "Hard" as const;
    const fiveDifficulty = (index: number) =>
      index < 2 ? "Easy" as const : index < 4 ? "Medium" as const : "Hard" as const;
    const mc = (index: number, targetItemIds: string[] = []) => ({
      difficulty: sevenDifficulty(index),
      prompt: "Question",
      choices: ["A", "B", "C", "D"],
      correctAnswer: "A",
      explanation: "Because A.",
      targetItemIds,
    });
    const state: {
      requestId: string;
      status: string;
      story: unknown;
      checkpoints: Record<string, unknown>;
      lessonPackage: Record<string, unknown> | null;
      lessonId: string | null;
    } = {
      requestId: "10000000-0000-4000-8000-000000000001",
      status: "queued",
      story: null,
      checkpoints: {},
      lessonPackage: null,
      lessonId: null,
    };

    state.status = "story_building";
    state.story = { lines: [{ japanese: "文です。", english: "A sentence." }] };
    state.status = "vocabulary_enrichment";
    state.status = "library_resolution";
    state.status = "activity_groups";

    state.checkpoints.vocabulary_and_kanji = {
      kanjiTeaching: Array.from({ length: 5 }, (_, index) => ({
        libraryId: ids[index],
        character: ["日", "本", "人", "学", "食"][index],
        reading: `reading-${index}`,
        meaning: `meaning-${index}`,
      })),
      vocabularyQuestions: Array.from({ length: 7 }, (_, index) =>
        mc(index, index < 5 ? [ids[index]] : []),
      ),
    };
    state.checkpoints.grammar_and_reading = {
      grammarTeaching: Array.from({ length: 3 }, (_, index) => ({
        libraryId: ids[index + 5],
        pattern: ["ている", "ことがある", "ながら"][index],
        meaning: `meaning-${index}`,
        formation: `formation-${index}`,
        usage: `usage-${index}`,
        example: `例文${index}。`,
        translation: `Example ${index}.`,
      })),
      grammarQuestions: Array.from({ length: 7 }, (_, index) =>
        mc(index, index < 3 ? [ids[index + 5]] : []),
      ),
      readingTitle: "Reading",
      readingJapaneseTitle: "読み物",
      readingConversation: [{ japanese: "文です。", english: "Sentence.", targetItemIds: [] }],
      readingQuestions: Array.from({ length: 5 }, (_, index) => ({
        q_no: index + 1,
        difficulty: index < 2 ? "easy" : index < 4 ? "medium" : "hard",
        question: `何ですか ${index + 1}。`,
        choices: ["文です。", "本です。", "学校です。", "友達です。"],
        answer: "文です。",
      })),
    };
    state.checkpoints.listening_and_speaking = {
      listeningExercises: Array.from({ length: 5 }, (_, index) => ({
        ...mc(index),
        difficulty: fiveDifficulty(index),
        transcript: "会話です。",
        conversationLines: ["会話です。"],
      })),
      speakingExercises: Array.from({ length: 5 }, (_, index) => ({
        mode: index < 2 ? "easy" : index < 4 ? "medium" : "hard",
        questionType: "read_aloud",
        prompt: "読みます。",
        expectedAnswer: "読みます。",
        modelAnswer: "読みます。",
        expectedConcepts: ["読みます。"],
        semanticCriteria: ["Match"],
        targetItemIds: [],
      })),
    };

    expect(inspectPersistedActivityCheckpoints(state.checkpoints, validIds)).toMatchObject({
      valid: ACTIVITY_GROUPS,
      invalid: [],
      missing: [],
    });

    state.status = "final_validation";
    state.lessonPackage = {
      schemaVersion: 2,
      title: "Lesson",
      japaneseTitle: "レッスン",
      summary: "Summary",
      story: Array.from({ length: 10 }, () => ({ japanese: "文です。", english: "Sentence." })),
      kanji: Array.from({ length: 5 }, () => ({})),
      vocabulary: Array.from({ length: 8 }, () => ({})),
      grammar: Array.from({ length: 3 }, () => ({})),
      vocabularyQuestions: (state.checkpoints.vocabulary_and_kanji as Record<string, unknown>).vocabularyQuestions,
      grammarQuestions: (state.checkpoints.grammar_and_reading as Record<string, unknown>).grammarQuestions,
      readingConversation: (state.checkpoints.grammar_and_reading as Record<string, unknown>).readingConversation,
      readingQuestions: (state.checkpoints.grammar_and_reading as Record<string, unknown>).readingQuestions,
      listeningExercises: (state.checkpoints.listening_and_speaking as Record<string, unknown>).listeningExercises,
      speakingExercises: (state.checkpoints.listening_and_speaking as Record<string, unknown>).speakingExercises,
      reviewQuestions: [],
    };
    expect(playableLessonPackageIssues(state.lessonPackage)).toEqual([]);
    state.status = "lesson_saving";
    state.lessonId = "20000000-0000-4000-8000-000000000001";
    state.status = "audio";
    expect(state).toMatchObject({ lessonId: expect.any(String), status: "audio" });
  });
});
