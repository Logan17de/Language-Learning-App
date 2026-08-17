import { describe, expect, it } from "vitest";
import {
  ACTIVITY_GROUPS,
  activityGroupCheckpointIssues,
  groupForPackageIssue,
  inspectPersistedActivityCheckpoints,
  normalizeGeneratedCheckpoint,
  playableLessonPackageIssues,
  resolvedLibraryCheckpointIssues,
  storyCheckpointIssues,
} from "@/lib/custom-lessons/checkpoint-validation";

const ids = new Set(Array.from({ length: 20 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
));
const idList = [...ids];

function sevenDifficulty(index: number) {
  if (index < 3) return "Easy" as const;
  if (index < 5) return "Medium" as const;
  return "Hard" as const;
}

function fiveDifficulty(index: number) {
  if (index < 2) return "Easy" as const;
  if (index < 4) return "Medium" as const;
  return "Hard" as const;
}

function mc(index: number, targetItemIds: string[] = []) {
  return {
    activityType: "multiple_choice",
    difficulty: sevenDifficulty(index),
    mode: "mixed",
    skill: "understanding",
    prompt: `Question ${index}`,
    cue: "Cue",
    choices: ["A", "B", "C", "D"],
    correctAnswer: "A",
    acceptedAnswers: ["A"],
    explanation: "A is correct.",
    hintFront: "Hint",
    hintBack: "Answer",
    targetItemIds,
  };
}

function validCheckpoints() {
  return {
    vocabulary_and_kanji: {
      kanjiTeaching: Array.from({ length: 5 }, (_, index) => ({
        libraryId: idList[index],
        character: ["日", "本", "人", "学", "食"][index],
        reading: ["にち", "ほん", "ひと", "がく", "しょく"][index],
        meaning: ["day", "book/origin", "person", "study", "eat/food"][index],
      })),
      vocabularyQuestions: Array.from({ length: 7 }, (_, index) =>
        mc(index, index < 5 ? [idList[index]] : []),
      ),
    },
    grammar_and_reading: {
      grammarTeaching: Array.from({ length: 3 }, (_, index) => ({
        libraryId: idList[index + 5],
        pattern: ["ている", "ことがある", "ながら"][index],
        meaning: `Meaning ${index + 1}`,
        formation: `Formation ${index + 1}`,
        usage: `Usage ${index + 1}`,
        example: `例文${index + 1}。`,
        translation: `Example ${index + 1}.`,
      })),
      grammarQuestions: Array.from({ length: 7 }, (_, index) =>
        mc(index, index < 3 ? [idList[index + 5]] : []),
      ),
      readingTitle: "Reading",
      readingJapaneseTitle: "読み物",
      readingConversation: [{
        speaker: "Reading",
        japanese: "日本語です。",
        english: "This is Japanese.",
        targetItemIds: [],
      }],
      readingQuestions: Array.from({ length: 5 }, (_, index) => ({
        q_no: index + 1,
        difficulty: index < 2 ? "easy" : index < 4 ? "medium" : "hard",
        question: `何ですか ${index + 1}。`,
        choices: ["日本語です。", "英語です。", "本です。", "学校です。"],
        answer: "日本語です。",
      })),
    },
    listening_and_speaking: {
      listeningExercises: Array.from({ length: 5 }, (_, index) => ({
        ...mc(index),
        difficulty: fiveDifficulty(index),
        conversationLines: ["A: こんにちは。", "B: こんにちは。"],
        transcript: "A: こんにちは。\nB: こんにちは。",
      })),
      speakingExercises: Array.from({ length: 5 }, (_, index) => ({
        mode: index < 2 ? "easy" : index < 4 ? "medium" : "hard",
        questionType: "read_aloud",
        prompt: "日本語を読みます。",
        easyPrompt: "日本語を読みます。",
        mediumPrompt: "",
        hardPrompt: "",
        expectedAnswer: "日本語を読みます。",
        modelAnswer: "日本語を読みます。",
        expectedConcepts: ["日本語を読みます。"],
        semanticCriteria: ["Match the sentence."],
        targetItemIds: [],
      })),
    },
  };
}

describe("custom lesson checkpoint validation", () => {
  it("uses only the three teaching/activity checkpoints", () => {
    expect(ACTIVITY_GROUPS).toEqual([
      "vocabulary_and_kanji",
      "grammar_and_reading",
      "listening_and_speaking",
    ]);
  });

  it("normalizes generated strings without removing structural evidence", () => {
    expect(normalizeGeneratedCheckpoint({ prompt: "  Ａ  ", choices: [" A ", " "] })).toEqual({
      prompt: "A",
      choices: ["A", ""],
    });
  });

  it("validates the persisted story checkpoint before later stages use it", () => {
    const story = {
      title: "Lesson",
      japaneseTitle: "Japanese lesson",
      summary: "Summary",
      storyPreview: "Preview",
      lines: [{
        japanese: Array.from({ length: 10 }, (_, index) => `Sentence ${index + 1}!`).join(""),
        english: Array.from({ length: 10 }, (_, index) => `Sentence ${index + 1}.`).join(" "),
      }],
    };
    expect(storyCheckpointIssues(story)).toEqual([]);
    story.lines[0].japanese = "One sentence!";
    expect(storyCheckpointIssues(story).join(" ")).toContain("10 to 15 Japanese sentences");
  });

  it("validates question structure without enforcing target-library content", () => {
    const group = validCheckpoints().vocabulary_and_kanji;
    group.vocabularyQuestions[0].choices = ["A", " A ", "C", "D"];
    group.vocabularyQuestions[1].correctAnswer = "Z";
    group.vocabularyQuestions[2].targetItemIds = [];
    group.vocabularyQuestions[3].targetItemIds = ["00000000-0000-4000-8000-999999999999"];
    const issues = activityGroupCheckpointIssues("vocabulary_and_kanji", group, ids);
    expect(issues.join(" ")).toContain("choices must be distinct");
    expect(issues.join(" ")).toContain("correctAnswer must occur in choices");
    expect(issues.join(" ")).not.toContain("targetItemId");
    expect(issues.join(" ")).not.toContain("references invalid library ID");
  });

  it("requires lesson-specific kanji and grammar teaching outputs", () => {
    const checkpoints = validCheckpoints();
    checkpoints.vocabulary_and_kanji.kanjiTeaching[0].reading = "";
    checkpoints.grammar_and_reading.grammarTeaching[0].formation = "";
    expect(activityGroupCheckpointIssues(
      "vocabulary_and_kanji",
      checkpoints.vocabulary_and_kanji,
      ids,
    ).join(" ")).toContain("requires non-empty reading");
    expect(activityGroupCheckpointIssues(
      "grammar_and_reading",
      checkpoints.grammar_and_reading,
      ids,
    ).join(" ")).toContain("requires non-empty formation");
  });

  it("requires five reading MCQs and five communication activities", () => {
    const checkpoints = validCheckpoints();
    checkpoints.grammar_and_reading.readingQuestions[0].choices = ["日本語です。"];
    checkpoints.listening_and_speaking.listeningExercises[0].conversationLines = [];
    checkpoints.listening_and_speaking.speakingExercises[0].questionType = "question";
    expect(activityGroupCheckpointIssues(
      "grammar_and_reading",
      checkpoints.grammar_and_reading,
      ids,
    ).join(" ")).toContain("exactly four non-empty choices");
    const communication = activityGroupCheckpointIssues(
      "listening_and_speaking",
      checkpoints.listening_and_speaking,
      ids,
    ).join(" ");
    expect(communication).toContain("conversationLines must be populated");
    expect(communication).toContain("playable read_aloud");
  });

  it("invalidates only bad persisted groups and preserves valid checkpoints", () => {
    const checkpoints = validCheckpoints();
    checkpoints.grammar_and_reading.readingConversation[0].japanese = "";
    const inspection = inspectPersistedActivityCheckpoints(checkpoints, ids);
    expect(inspection.invalid.map((item) => item.group)).toEqual(["grammar_and_reading"]);
    expect(inspection.valid).toEqual([
      "vocabulary_and_kanji",
      "listening_and_speaking",
    ]);
  });

  it("accepts catalog identity rows without teaching metadata", () => {
    const library = {
      kanji: Array.from({ length: 5 }, (_, index) => ({
        libraryId: idList[index], character: ["日", "本", "人", "学", "食"][index], readings: [], meanings: [],
      })),
      grammar: Array.from({ length: 3 }, (_, index) => ({
        libraryId: idList[index + 5], pattern: ["ている", "ことがある", "ながら"][index], meaning: "", formation: "",
        usageNotes: "", examples: [],
      })),
      vocabulary: Array.from({ length: 8 }, (_, index) => ({
        libraryId: idList[index + 8], term: `語${index}`, reading: `ご${index}`, meaning: `word ${index}`,
      })),
    };
    expect(resolvedLibraryCheckpointIssues(library)).toEqual([]);
    const missingIdIssues = resolvedLibraryCheckpointIssues(
      library,
      new Set(idList.filter((id) => id !== idList[1])),
    ).join(" ");
    expect(missingIdIssues).toContain("references invalid library ID");
  });

  it("validates the complete 7-7-5-5-5 package with no review", () => {
    const checkpoints = validCheckpoints();
    const lesson = {
      schemaVersion: 2,
      title: "Lesson",
      japaneseTitle: "レッスン",
      summary: "Summary",
      story: Array.from({ length: 10 }, () => ({ japanese: "文です。", english: "A sentence." })),
      kanji: Array.from({ length: 5 }, () => ({})),
      vocabulary: Array.from({ length: 8 }, () => ({})),
      grammar: Array.from({ length: 3 }, () => ({})),
      vocabularyQuestions: checkpoints.vocabulary_and_kanji.vocabularyQuestions,
      grammarQuestions: checkpoints.grammar_and_reading.grammarQuestions,
      readingConversation: checkpoints.grammar_and_reading.readingConversation,
      readingQuestions: checkpoints.grammar_and_reading.readingQuestions,
      listeningExercises: checkpoints.listening_and_speaking.listeningExercises,
      speakingExercises: checkpoints.listening_and_speaking.speakingExercises,
      reviewQuestions: [],
    };
    expect(playableLessonPackageIssues(lesson)).toEqual([]);
    lesson.story[0].japanese = "";
    expect(playableLessonPackageIssues(lesson).join(" ")).toContain("Story line 1 is not playable");
  });

  it("maps package validation issues to the responsible checkpoint", () => {
    expect(groupForPackageIssue("reviewQuestions must contain 0 items.")).toBeNull();
    expect(groupForPackageIssue("speakingExercises must contain 5 items.")).toBe("listening_and_speaking");
    expect(groupForPackageIssue("readingConversation must not be empty.")).toBe("grammar_and_reading");
    expect(groupForPackageIssue("vocabularyQuestions must contain 7 items.")).toBe("vocabulary_and_kanji");
    expect(groupForPackageIssue("kanji lesson metadata is incomplete.")).toBe("vocabulary_and_kanji");
    expect(groupForPackageIssue("Story line 1 is not playable.")).toBeNull();
  });
});
