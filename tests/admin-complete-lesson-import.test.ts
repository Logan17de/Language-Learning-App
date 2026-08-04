import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseCompleteLessonImport,
  validateCompleteLessonImport,
} from "@/lib/admin-complete-lesson-import";
import { COMPLETE_LESSON_CHAT_PROMPT } from "@/lib/admin-complete-lesson-prompt";

const route = readFileSync("app/api/admin/lessons/import/route.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260804190000_admin_complete_lesson_import.sql",
  "utf8",
);

function choice(id: string, difficulty: "Easy" | "Medium" | "Hard") {
  return {
    id,
    mode: "mixed",
    modeLabel: "In context",
    type: "multiple-choice",
    skill: "understanding",
    answerMode: "choice",
    difficulty,
    prompt: "正しい答えを選んでください。",
    cue: "学校",
    choices: ["学校", "先生", "電車", "会社"],
    correctAnswer: "学校",
    acceptedAnswers: ["学校"],
    explanation: "学校 is the correct answer.",
    hintFront: "学…",
    hintBack: "…校",
    targetRefs: ["vocabulary:学校"],
  };
}

function completeLesson() {
  const vocabularyDifficulties = [
    ...Array(6).fill("Easy"),
    ...Array(4).fill("Medium"),
    ...Array(3).fill("Hard"),
  ] as Array<"Easy" | "Medium" | "Hard">;
  const grammarDifficulties = [
    ...Array(3).fill("Easy"),
    ...Array(4).fill("Medium"),
    ...Array(3).fill("Hard"),
  ] as Array<"Easy" | "Medium" | "Hard">;
  const listening = Array.from({ length: 5 }, (_, index) => ({
    ...choice(`listening_${index + 1}`, index < 2 ? "Easy" : index < 4 ? "Medium" : "Hard"),
    transcript: "A：学校へ行きます。\nB：はい、行きましょう。\nA：電車ですか。\nB：はい。\nA：わかりました。",
    conversationLines: [
      "A：学校へ行きます。",
      "B：はい、行きましょう。",
      "A：電車ですか。",
      "B：はい。",
      "A：わかりました。",
    ],
  }));
  return {
    schemaVersion: 1,
    id: "lesson_n5_school_test",
    title: "Going to School",
    japaneseTitle: "学校へ行く",
    topic: "School",
    level: "N5",
    durationMinutes: 30,
    tags: ["school"],
    summary: "A beginner lesson about travelling to school with a friend.",
    storyPreview: "朝、学校へ行きます。",
    kanji: ["学", "校", "先", "生", "電"].map((character) => ({ character, reading: "がく", meaning: "sample meaning" })),
    grammar: ["～ます", "～てください", "～ましょう"].map((pattern, index) => ({
      id: `grammar_${index + 1}`,
      pattern,
      meaning: "sample meaning",
      structure: "sample structure",
      usage: "sample usage",
      example: "学校へ行きます。",
      translation: "I go to school.",
      commonMistake: "",
    })),
    vocabulary: ["学校", "先生", "電車", "会社", "友達", "朝", "行きます", "会います"].map((term) => ({
      term,
      reading: term === "学校" ? "がっこう" : "かな",
      meaning: `meaning of ${term}`,
      partOfSpeech: "expression",
      exampleSentence: `${term}を使います。`,
    })),
    story: [{
      japanese: "朝、学校へ行きます。友達に会います。先生に話します。教室へ入ります。本を読みます。日本語を勉強します。昼ご飯を食べます。午後も勉強します。友達と帰ります。夜、宿題をします。",
      english: "In the morning, I go to school and meet my friend.",
      words: [
        { surface: "朝", reading: "かな", meaning: "meaning of 朝", scriptType: "kanji" },
        { surface: "学校", reading: "がっこう", meaning: "meaning of 学校", scriptType: "kanji" },
        { surface: "行きます", reading: "かな", meaning: "meaning of 行きます", scriptType: "kanji" },
        { surface: "友達", reading: "かな", meaning: "meaning of 友達", scriptType: "kanji" },
        { surface: "会います", reading: "かな", meaning: "meaning of 会います", scriptType: "kanji" },
      ],
    }],
    vocabularyQuestions: vocabularyDifficulties.map((difficulty, index) => choice(`vocab_${index + 1}`, difficulty)),
    grammarQuestions: grammarDifficulties.map((difficulty, index) => ({
      ...choice(`grammar_q_${index + 1}`, difficulty),
      targetRefs: ["grammar:～ます"],
    })),
    speakingExercises: [
      ["direct_information", "easy"],
      ["sequence_of_events", "easy"],
      ["speaker_intention", "medium"],
      ["reason_or_purpose", "medium"],
      ["simple_inference", "hard"],
    ].map(([questionType, mode], index) => ({
      id: `speaking_${index + 1}`,
      questionType,
      mode,
      prompt: "主人公はどこへ行きますか。",
      modelAnswer: "主人公は学校へ行きます。",
      expectedAnswer: "主人公は学校へ行きます。",
      expectedConcepts: ["主人公", "学校"],
      semanticCriteria: ["The answer identifies the school."],
      targetRefs: ["vocabulary:学校"],
    })),
    readingTitle: "Another School Morning",
    readingJapaneseTitle: "別の朝",
    readingConversation: [{
      speaker: "Narrator",
      japanese: "先生は朝、学校へ行きます。教室を開けます。本を準備します。学生を待ちます。学生が来ます。授業を始めます。日本語を教えます。質問を聞きます。昼に休みます。午後も授業をします。",
      english: "The teacher goes to school in the morning.",
    }],
    readingQuestions: ["easy", "easy", "medium", "medium", "hard"].map((difficulty, index) => ({
      id: `reading_${index + 1}`,
      difficulty,
      question: "先生はどこへ行きますか。",
      answer: "先生は学校へ行きます。",
    })),
    listeningExercises: listening,
    reviewQuestions: Array.from({ length: 5 }, (_, index) => {
      const category = ["kanji", "vocabulary", "grammar", "listening", "speaking"][index];
      const refs: Record<string, string[]> = {
        kanji: ["kanji:学"],
        vocabulary: ["vocabulary:学校"],
        grammar: ["grammar:～ます"],
        listening: ["vocabulary:学校"],
        speaking: ["grammar:～ます"],
      };
      return {
        ...choice(`review_${index + 1}`, "Easy"),
        questionType: "multiple-choice",
        category,
        targetRefs: refs[category],
      };
    }),
  };
}

describe("complete admin lesson import", () => {
  it("accepts the complete seven-phase contract", () => {
    const result = validateCompleteLessonImport(completeLesson());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.counts).toMatchObject({
      vocabularyQuestions: 13,
      grammarQuestions: 10,
      speakingQuestions: 5,
      readingQuestions: 5,
      listeningQuestions: 5,
      reviewQuestions: 5,
    });
  });

  it("parses fenced JSON and rejects an ambiguous answer bank", () => {
    const parsed = parseCompleteLessonImport(`\`\`\`json\n${JSON.stringify(completeLesson())}\n\`\`\``);
    const lesson = parsed as ReturnType<typeof completeLesson>;
    lesson.vocabularyQuestions[0].choices[1] = lesson.vocabularyQuestions[0].correctAnswer;
    const result = validateCompleteLessonImport(lesson);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Vocabulary question 1 needs four unique choices.");
  });

  it("stores through a staff-only transaction without a generation model call", () => {
    expect(route).toContain('authorize("manage_content")');
    expect(route).toContain('rpc("import_complete_lesson"');
    expect(route).not.toContain("generateStructured");
    expect(route).not.toContain("OPENAI_");
    expect(migration).toContain("create or replace function public.import_complete_lesson");
    expect(migration).toContain("public.has_app_role(array['admin', 'content_editor']");
    expect(migration).toContain("'model_api_used', false");
    expect(migration).toContain("public.resolve_admin_lesson_target_ids");
  });

  it("ships a copyable whole-lesson chat prompt with every fixed bank size", () => {
    expect(COMPLETE_LESSON_CHAT_PROMPT).toContain("Return one valid JSON object only");
    expect(COMPLETE_LESSON_CHAT_PROMPT).toContain("Kanji: exactly 5");
    expect(COMPLETE_LESSON_CHAT_PROMPT).toContain("Grammar: exactly 3");
    expect(COMPLETE_LESSON_CHAT_PROMPT).toContain("exactly 13 questions: 6 Easy, 4 Medium, 3 Hard");
    expect(COMPLETE_LESSON_CHAT_PROMPT).toContain("exactly 10 questions: 3 Easy, 4 Medium, 3 Hard");
    expect(COMPLETE_LESSON_CHAT_PROMPT).toContain("Speaking: exactly 5 Japanese questions");
  });
});
