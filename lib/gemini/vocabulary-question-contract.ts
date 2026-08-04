import type { JsonSchema } from "@/lib/openai/structured-output";

export type RawVocabularyQuestionDifficulty = "easy" | "medium" | "hard";

export interface VocabularyQuestionFormat {
  id: number;
  difficulty: RawVocabularyQuestionDifficulty[];
  name: string;
  question: string;
  sentence?: string;
}

export interface RawVocabularyQuestion {
  format_id: number;
  difficulty: RawVocabularyQuestionDifficulty;
  question: string;
  sentence: string | null;
  choices: string[];
  answer: string;
}

export interface RawVocabularyQuestions {
  questions: RawVocabularyQuestion[];
}

export const vocabularyQuestionFormats: VocabularyQuestionFormat[] = [
  { id: 1, difficulty: ["easy"], name: "Kanji to Reading", question: 'What is the correct reading of "<KANJI_WORD>"?' },
  { id: 2, difficulty: ["easy"], name: "Kana to Meaning", question: 'What does "<HIRAGANA_WORD>" mean?' },
  { id: 3, difficulty: ["easy", "hard"], name: "Kanji to Meaning", question: 'What does "<KANJI_WORD>" mean?' },
  { id: 4, difficulty: ["easy", "hard"], name: "Meaning to Japanese", question: 'Which Japanese word means "<ENGLISH_WORD>"?' },
  { id: 5, difficulty: ["medium"], name: "Fill in the Blank", question: "Choose the best word to complete the sentence.", sentence: "<JP_SENTENCE_WITH_BLANK>" },
  { id: 6, difficulty: ["medium"], name: "Similar Meaning", question: 'Which word has the closest meaning to "<TARGET_WORD>"?' },
  { id: 7, difficulty: ["hard"], name: "Similar Meaning (Advanced)", question: 'Which word is the closest synonym of "<TARGET_WORD>" in this context?', sentence: "<OPTIONAL_JP_SENTENCE>" },
  { id: 8, difficulty: ["medium"], name: "Opposite Meaning", question: 'Which word has the opposite meaning of "<TARGET_WORD>"?' },
  { id: 9, difficulty: ["medium"], name: "Category Classification", question: 'Which word belongs to the "<CATEGORY>" category?' },
  { id: 10, difficulty: ["medium"], name: "Sentence Topic", question: "What is this sentence mainly about?", sentence: "<JP_SENTENCE>" },
  { id: 11, difficulty: ["medium"], name: "Correct Word Usage", question: 'Which sentence uses "<TARGET_WORD>" correctly?' },
  { id: 12, difficulty: ["hard"], name: "English to Kanji", question: 'Which Japanese word means "<ENGLISH_WORD>"?' },
  { id: 13, difficulty: ["hard"], name: "Confusing Words", question: 'Which word correctly matches "<ENGLISH_WORD>"?' },
  { id: 14, difficulty: ["hard"], name: "Context Selection", question: "Choose the best word to complete the sentence.", sentence: "<JP_SENTENCE_WITH_BLANK>" },
  { id: 15, difficulty: ["hard"], name: "Natural Expression", question: "Which sentence sounds the most natural?" },
  { id: 16, difficulty: ["hard"], name: "Compound Reading", question: 'What is the correct reading of "<KANJI_COMPOUND>"?' },
];

export const vocabularyQuestionsSchema: JsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          format_id: { type: "integer" },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
          },
          question: { type: "string" },
          sentence: { type: ["string", "null"] },
          choices: {
            type: "array",
            items: { type: "string" },
            minItems: 4,
            maxItems: 4,
          },
          answer: { type: "string" },
        },
        required: [
          "format_id",
          "difficulty",
          "question",
          "sentence",
          "choices",
          "answer",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

function pythonJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(", ")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => `${JSON.stringify(key)}: ${pythonJson(child)}`)
      .join(", ")}}`;
  }
  throw new Error("Unsupported vocabulary question format value.");
}

function pythonStringList(values: string[]): string {
  return `[${values.map((value) => `'${value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'")}'`).join(", ")}]`;
}

export function vocabularyQuestionsPrompt(input: {
  japaneseStory: string;
  knownKanji: string[];
  questionFormats?: VocabularyQuestionFormat[];
}): string {
  return `
Create vocabulary and kanji questions from this Japanese story.

Story:
${input.japaneseStory}

Kanji:
${pythonStringList(input.knownKanji)}

Question formats:
${pythonJson(input.questionFormats ?? vocabularyQuestionFormats)}

Requirements:
- Use only the provided question formats.
- Use vocabulary and kanji from the story.
- Create exactly 13 questions: 6 easy, 4 medium, and 3 hard.
- Every question must have four different choices and one correct answer.
`;
}

export function filterStoryPracticeKanji(input: {
  japaneseStory: string;
  knownKanji: string[];
  targetKanji: string[];
}): string[] {
  const allowed = new Set([...input.knownKanji, ...input.targetKanji]);
  return [...new Set(input.japaneseStory.match(/\p{Script=Han}/gu) ?? [])]
    .filter((character) => allowed.has(character));
}
