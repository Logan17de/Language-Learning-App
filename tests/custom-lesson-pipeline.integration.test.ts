import { describe, expect, it } from "vitest";
import {
  ACTIVITY_GROUPS,
  inspectPersistedActivityCheckpoints,
  playableLessonPackageIssues,
} from "@/lib/custom-lessons/checkpoint-validation";

describe("durable custom lesson pipeline integration model", () => {
  it("covers request creation through saved lesson while preserving checkpoints", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const validIds = new Set([id]);
    const mc = (category?: string) => ({
      ...(category ? { category } : {}), prompt: "Question", choices: ["A", "B", "C", "D"],
      correctAnswer: "A", explanation: "Because A.", targetItemIds: [id],
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
    state.status = "activity_groups";
    state.checkpoints.vocabulary_and_kanji = {
      vocabularyQuestions: Array.from({ length: 13 }, () => mc()),
    };
    state.checkpoints.grammar_and_reading = {
      grammarQuestions: Array.from({ length: 10 }, () => mc()),
      readingTitle: "Reading", readingJapaneseTitle: "読み物",
      readingConversation: [{ japanese: "文です。", english: "Sentence.", targetItemIds: [id] }],
      readingQuestions: [{ question: "何ですか。", answer: "文です。" }],
    };
    state.checkpoints.listening_and_speaking = {
      listeningExercises: Array.from({ length: 5 }, () => ({
        ...mc(), transcript: "会話です。", conversationLines: ["会話です。"],
      })),
      speakingExercises: Array.from({ length: 5 }, () => ({
        questionType: "read_aloud", prompt: "読みます。", expectedAnswer: "読みます。",
        modelAnswer: "読みます。", expectedConcepts: ["読みます。"], semanticCriteria: ["Match"],
        targetItemIds: [id],
      })),
    };
    state.checkpoints.final_review = {
      reviewQuestions: ["kanji", "vocabulary", "grammar", "listening", "speaking"].map(mc),
    };
    expect(inspectPersistedActivityCheckpoints(state.checkpoints, validIds)).toMatchObject({
      valid: ACTIVITY_GROUPS,
      invalid: [],
      missing: [],
    });

    state.status = "final_validation";
    state.lessonPackage = {
      schemaVersion: 2, title: "Lesson", japaneseTitle: "レッスン", summary: "Summary",
      story: Array.from({ length: 10 }, () => ({ japanese: "文です。", english: "Sentence." })),
      kanji: Array.from({ length: 5 }, () => ({})),
      vocabulary: Array.from({ length: 8 }, () => ({})),
      grammar: Array.from({ length: 3 }, () => ({})),
      vocabularyQuestions: (state.checkpoints.vocabulary_and_kanji as Record<string, unknown>).vocabularyQuestions,
      grammarQuestions: (state.checkpoints.grammar_and_reading as Record<string, unknown>).grammarQuestions,
      readingConversation: (state.checkpoints.grammar_and_reading as Record<string, unknown>).readingConversation,
      listeningExercises: (state.checkpoints.listening_and_speaking as Record<string, unknown>).listeningExercises,
      speakingExercises: (state.checkpoints.listening_and_speaking as Record<string, unknown>).speakingExercises,
      reviewQuestions: (state.checkpoints.final_review as Record<string, unknown>).reviewQuestions,
    };
    expect(playableLessonPackageIssues(state.lessonPackage)).toEqual([]);
    state.status = "lesson_saving";
    state.lessonId = "20000000-0000-4000-8000-000000000001";
    state.status = "audio";
    expect(state).toMatchObject({ lessonId: expect.any(String), status: "audio" });
  });
});
