import type { JsonSchema } from "@/lib/openai/structured-output";
import type { JLPTLevel } from "@/types/lesson";

export interface TranslationQuestionTarget {
  libraryId: string;
  pattern: string;
  meaning: string;
  role: "lesson_target" | "reinforcement";
}

export interface RawTranslationQuestion {
  requestIndex: number;
  english: string;
  modelAnswer: string;
}

export interface RawTranslationQuestions {
  questions: RawTranslationQuestion[];
}

export const translationQuestionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requestIndex", "english", "modelAnswer"],
        properties: {
          requestIndex: { type: "integer", minimum: 0, maximum: 4 },
          english: { type: "string", minLength: 2, maxLength: 240 },
          modelAnswer: { type: "string", minLength: 1, maxLength: 240 },
        },
      },
    },
  },
};

export function translationQuestionPrompt(input: {
  level: JLPTLevel;
  topic: string;
  targets: TranslationQuestionTarget[];
}): string {
  const indexedTargets = input.targets.map((target, requestIndex) => ({
    requestIndex,
    pattern: target.pattern,
    meaning: target.meaning,
    role: target.role,
  }));

  return `Create exactly five English-to-Japanese translation questions for a ${input.level} learner.
Topic/context: ${input.topic}

TARGETS
${JSON.stringify(indexedTargets)}

RULES
- Return one question for every supplied target, preserving requestIndex exactly once from 0 through 4.
- The first three targets are the lesson's current grammar targets. The final two are previously seen reinforcement patterns.
- Write the QUESTION itself in natural English. Do not put Japanese, a grammar hint, or the target pattern inside the English question.
- Most importantly: choose an English meaning/context for which the supplied Japanese target grammar pattern is a genuinely natural translation choice. Never force a pattern into a sentence where a Japanese speaker would normally choose something else.
- modelAnswer must be a natural Japanese translation of english and must use the corresponding target grammar pattern correctly.
- Preserve the English meaning, tense, polarity, person, and pragmatic nuance in modelAnswer.
- Keep vocabulary appropriate for ${input.level}; the grammar target may be the challenging part.
- Each English prompt must stand on its own. Avoid trivia, ambiguity, and sentences with several equally likely interpretations.
- Do not turn the task into multiple choice and do not provide explanations.

Return only the requested structured object.`;
}

export function translationQuestionOutputIssues(
  value: RawTranslationQuestions,
  expectedCount = 5,
): string[] {
  const issues: string[] = [];
  if (!Array.isArray(value.questions) || value.questions.length !== expectedCount) {
    return [`Translation generation must contain exactly ${expectedCount} questions.`];
  }
  const indexes = value.questions.map((question) => question.requestIndex);
  if (new Set(indexes).size !== expectedCount) {
    issues.push("Translation generation must use every requestIndex exactly once.");
  }
  for (let index = 0; index < expectedCount; index += 1) {
    if (!indexes.includes(index)) issues.push(`Translation question requestIndex ${index} is missing.`);
  }
  value.questions.forEach((question, index) => {
    if (!question.english?.trim()) issues.push(`Translation question ${index + 1} needs English text.`);
    if (!question.modelAnswer?.trim()) issues.push(`Translation question ${index + 1} needs a Japanese model answer.`);
    if (/[぀-ヿ㐀-鿿]/u.test(question.english ?? "")) {
      issues.push(`Translation question ${index + 1} must be English-only.`);
    }
  });
  return issues;
}
