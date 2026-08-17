import type { JsonSchema } from "@/lib/openai/structured-output";
import type { JLPTLevel } from "@/types/lesson";

export interface TranslationQuestionTarget {
  libraryId: string;
  pattern: string;
  meaning: string;
  role: "lesson_target" | "reinforcement" | "lesson_fallback";
}

export interface RawTranslationQuestion {
  requestIndex: number;
  english: string;
  modelAnswer: string;
}

export interface RawTranslationQuestions {
  questions: RawTranslationQuestion[];
}

export interface TranslationEvaluation {
  correct: boolean;
  feedback: string;
  suggestion: string;
  suggestedAnswer: string;
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

export const translationEvaluationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["correct", "feedback", "suggestion", "suggestedAnswer"],
  properties: {
    correct: { type: "boolean" },
    feedback: { type: "string", minLength: 1, maxLength: 500 },
    suggestion: { type: "string", minLength: 1, maxLength: 500 },
    suggestedAnswer: { type: "string", minLength: 1, maxLength: 240 },
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
- The first three targets are the lesson's current grammar targets.
- The final two normally reinforce previously practised grammar in the learner's 60-80 mastery band. If learner history is still sparse, a lesson target may intentionally appear again as extra production practice.
- Write the QUESTION itself in natural English. Do not put Japanese, a grammar hint, the target pattern, or the target meaning inside the English question.
- Most importantly: create an English sentence whose meaning makes the supplied Japanese target grammar pattern a genuinely natural translation choice. Never force a pattern into a context where a Japanese speaker would normally choose something else.
- modelAnswer must be a natural Japanese translation of english and must use the corresponding target grammar pattern correctly.
- Preserve the English meaning, tense, polarity, person, and pragmatic nuance in modelAnswer.
- Keep vocabulary appropriate for ${input.level}; the grammar target may be the challenging part.
- Each English prompt must stand on its own. Avoid trivia, ambiguity, and sentences with several equally likely interpretations.
- Do not turn the task into multiple choice and do not provide explanations.

Return only the requested structured object.`;
}

export function translationEvaluationPrompt(input: {
  english: string;
  targetPattern: string;
  targetMeaning: string;
  modelAnswer: string;
  learnerAnswer: string;
}): string {
  return `Evaluate one learner's English-to-Japanese translation.

ENGLISH SOURCE
${input.english}

REQUIRED GRAMMAR PATTERN
${input.targetPattern}
Meaning/usage: ${input.targetMeaning}

HIDDEN REFERENCE ANSWER
${input.modelAnswer}

LEARNER ANSWER
${input.learnerAnswer}

EVALUATION RULES
- Judge meaning and natural Japanese, not exact string matching.
- The hidden reference answer is an example of the intended meaning and grammar use, not a string the learner must copy.
- Mark correct only when the learner preserves the important meaning of the English source AND uses the required grammar pattern correctly and naturally.
- Accept normal Japanese variation in vocabulary, particles, word order, politeness, contractions, kanji/kana choice, and omitted subjects when the meaning remains clear.
- Do not mark an answer wrong for harmless punctuation or spacing differences.
- A grammatically valid Japanese sentence that avoids the required target pattern is incorrect for this exercise.
- A sentence that contains the pattern mechanically but uses it with the wrong meaning, formation, tense, polarity, or nuance is incorrect.
- feedback: briefly say why the answer is correct or what specifically is wrong.
- suggestion: give one concrete improvement or natural alternative. Even when correct, give a useful refinement rather than empty praise.
- suggestedAnswer: provide one natural Japanese answer that preserves the English meaning and uses the required target pattern.
- Keep feedback and suggestion concise and learner-friendly.

Return only the requested structured object.`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function translationQuestionOutputIssues(value: unknown): string[] {
  const container = record(value);
  if (!container || !Array.isArray(container.questions)) {
    return ["Translation generation must contain exactly 5 questions."];
  }

  const questions = container.questions;
  if (questions.length !== 5) {
    return ["Translation generation must contain exactly 5 questions."];
  }

  const issues: string[] = [];
  const indexes: number[] = [];
  questions.forEach((rawQuestion, index) => {
    const question = record(rawQuestion);
    if (!question) {
      issues.push(`Translation question ${index + 1} must be an object.`);
      return;
    }
    if (typeof question.requestIndex !== "number" || !Number.isInteger(question.requestIndex)) {
      issues.push(`Translation question ${index + 1} needs an integer requestIndex.`);
    } else {
      indexes.push(question.requestIndex);
    }
    if (typeof question.english !== "string" || !question.english.trim()) {
      issues.push(`Translation question ${index + 1} needs English text.`);
    } else if (/[぀-ヿ㐀-鿿]/u.test(question.english)) {
      issues.push(`Translation question ${index + 1} must be English-only.`);
    }
    if (typeof question.modelAnswer !== "string" || !question.modelAnswer.trim()) {
      issues.push(`Translation question ${index + 1} needs a Japanese model answer.`);
    }
  });

  if (new Set(indexes).size !== 5) {
    issues.push("Translation generation must use every requestIndex exactly once.");
  }
  for (let index = 0; index < 5; index += 1) {
    if (!indexes.includes(index)) {
      issues.push(`Translation question requestIndex ${index} is missing.`);
    }
  }
  return issues;
}

export function translationEvaluationOutputIssues(value: unknown): string[] {
  const evaluation = record(value);
  if (!evaluation) return ["Translation validation must return one result object."];

  const issues: string[] = [];
  if (typeof evaluation.correct !== "boolean") {
    issues.push("Translation validation needs a boolean correct verdict.");
  }
  for (const field of ["feedback", "suggestion", "suggestedAnswer"] as const) {
    if (typeof evaluation[field] !== "string" || !evaluation[field].trim()) {
      issues.push(`Translation validation needs ${field}.`);
    }
  }
  return issues;
}
