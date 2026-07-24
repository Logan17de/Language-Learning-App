import "server-only";

import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

interface GenerationInput {
  topic: string;
  level: JLPTLevel;
  interests: string[];
  durationMinutes: number;
  focus: string;
  speakingDifficulty: "easy" | "medium" | "hard";
  note: string;
}

const stringArray = { type: "array", items: { type: "string" } };
const lessonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "japaneseTitle", "summary", "storyPreview", "tags", "reviewItems", "story",
    "vocabulary", "grammar", "readingConversation", "listeningExercises",
    "speakingExercises", "reviewQuestions", "answerKeys", "phases",
  ],
  properties: {
    title: { type: "string" },
    japaneseTitle: { type: "string" },
    summary: { type: "string" },
    storyPreview: { type: "string" },
    tags: stringArray,
    reviewItems: stringArray,
    story: {
      type: "array", minItems: 5, maxItems: 10,
      items: {
        type: "object", additionalProperties: false,
        required: ["japanese", "english", "tappableTerms"],
        properties: { japanese: { type: "string" }, english: { type: "string" }, tappableTerms: stringArray },
      },
    },
    vocabulary: {
      type: "array", minItems: 5, maxItems: 12,
      items: {
        type: "object", additionalProperties: false,
        required: ["term", "reading", "meaning", "partOfSpeech", "exampleSentence"],
        properties: {
          term: { type: "string" }, reading: { type: "string" }, meaning: { type: "string" },
          partOfSpeech: { type: "string" }, exampleSentence: { type: "string" },
        },
      },
    },
    grammar: {
      type: "array", minItems: 1, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["pattern", "meaning", "structure", "usage", "example", "translation", "commonMistake"],
        properties: {
          pattern: { type: "string" }, meaning: { type: "string" }, structure: { type: "string" },
          usage: { type: "string" }, example: { type: "string" }, translation: { type: "string" },
          commonMistake: { type: "string" },
        },
      },
    },
    readingConversation: {
      type: "array", minItems: 2, maxItems: 6,
      items: {
        type: "object", additionalProperties: false,
        required: ["speaker", "japanese", "english"],
        properties: { speaker: { type: "string" }, japanese: { type: "string" }, english: { type: "string" } },
      },
    },
    listeningExercises: {
      type: "array", minItems: 1, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["prompt", "transcript", "choices", "correctAnswer", "explanation", "questionType"],
        properties: {
          prompt: { type: "string" }, transcript: { type: "string" }, choices: stringArray,
          correctAnswer: { type: "string" }, explanation: { type: "string" },
          questionType: { type: "string", enum: ["multiple-choice"] },
        },
      },
    },
    speakingExercises: {
      type: "array", minItems: 1, maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        required: ["mode", "prompt", "modelAnswer", "easyPrompt", "mediumPrompt", "hardPrompt", "expectedAnswer"],
        properties: {
          mode: { type: "string", enum: ["easy", "medium", "hard"] }, prompt: { type: "string" },
          modelAnswer: { type: "string" }, easyPrompt: { type: "string" }, mediumPrompt: { type: "string" },
          hardPrompt: { type: "string" }, expectedAnswer: { type: "string" },
        },
      },
    },
    reviewQuestions: {
      type: "array", minItems: 3, maxItems: 6,
      items: {
        type: "object", additionalProperties: false,
        required: ["prompt", "choices", "correctAnswer", "explanation", "questionType"],
        properties: {
          prompt: { type: "string" }, choices: stringArray, correctAnswer: { type: "string" },
          explanation: { type: "string" }, questionType: { type: "string", enum: ["multiple-choice", "true-false"] },
        },
      },
    },
    answerKeys: stringArray,
    phases: {
      type: "array", minItems: 7, maxItems: 7,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "label", "description"],
        properties: {
          id: { type: "string", enum: ["story", "vocabulary", "grammar", "reading", "listening", "speaking", "review"] },
          label: { type: "string" }, description: { type: "string" },
        },
      },
    },
  },
} as const;

function outputText(response: unknown): string | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && !Array.isArray(part)
          && (part as { type?: unknown }).type === "output_text"
          && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function validPackage(value: unknown): value is Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const packageValue = value as Record<string, unknown>;
  return typeof packageValue.title === "string"
    && Array.isArray(packageValue.phases) && packageValue.phases.length === 7
    && Array.isArray(packageValue.story) && packageValue.story.length >= 3
    && Array.isArray(packageValue.vocabulary) && packageValue.vocabulary.length >= 3
    && Array.isArray(packageValue.reviewQuestions) && packageValue.reviewQuestions.length >= 1;
}

export async function generateLessonPackage(input: GenerationInput): Promise<Json> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_LESSON_MODEL?.trim() || "gpt-5.6";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "You design accurate, engaging Japanese lessons. Keep every word, grammar point, and exercise appropriate for the learner's JLPT level. Every correctAnswer must exactly match one choice. Return only the requested structured package.",
        },
        {
          role: "user",
          content: [
            `Topic: ${input.topic}`,
            `Learner JLPT level: ${input.level}`,
            `Learner interests to weave in naturally: ${input.interests.join(", ") || "none supplied"}`,
            `Target duration: ${input.durationMinutes} minutes`,
            `Preferred focus: ${input.focus}`,
            `Speaking difficulty: ${input.speakingDifficulty}`,
            `Learner note: ${input.note || "none"}`,
          ].join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "aiko_lesson_package",
          strict: true,
          schema: lessonSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && !Array.isArray(payload)
      && "error" in payload && payload.error && typeof payload.error === "object"
      && "message" in payload.error && typeof payload.error.message === "string"
      ? payload.error.message
      : "OpenAI lesson generation failed.";
    throw new Error(message);
  }
  const text = outputText(payload);
  if (!text) throw new Error("The model did not return a lesson package.");
  const lesson: unknown = JSON.parse(text);
  if (!validPackage(lesson)) throw new Error("The generated lesson package did not pass validation.");
  return lesson;
}
