import "server-only";

import {
  generateStructured,
  type JsonSchema,
} from "@/lib/gemini/structured-output";
import type {
  ActivityGroupName,
  CommunicationGroup,
  GrammarReadingGroup,
  PracticeQuestion,
  VocabularyKanjiGroup,
} from "@/lib/gemini/lesson-activity-groups";
import type {
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import type { JLPTLevel } from "@/types/lesson";

interface ItemVerdict {
  requestIndex: number;
  approved: boolean;
  issues: string[];
}

interface ValidatorDecision {
  approved: boolean;
  items: ItemVerdict[];
}

export interface ActivityValidationApproval {
  model: string;
  repaired: boolean;
  checkedItems: number;
}

type ValidatedGroup = Exclude<ActivityGroupName, "final_review">;
type QuestionPayload = PracticeQuestion | CommunicationGroup["listeningExercises"][number];

function stringArray(maxItems = 8): JsonSchema {
  return {
    type: "array",
    minItems: 0,
    maxItems,
    items: { type: "string" },
  };
}

function decisionSchema(itemCount: number): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["approved", "items"],
    properties: {
      approved: { type: "boolean" },
      items: {
        type: "array",
        minItems: itemCount,
        maxItems: itemCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["requestIndex", "approved", "issues"],
          properties: {
            requestIndex: { type: "integer" },
            approved: { type: "boolean" },
            issues: stringArray(),
          },
        },
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decisionIssues(value: unknown, itemCount: number): string[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return ["Validator decision must contain item verdicts."];
  }
  const issues: string[] = [];
  if (typeof value.approved !== "boolean") {
    issues.push("approved must be boolean.");
  }
  if (value.items.length !== itemCount) {
    issues.push(`Validator must return exactly ${itemCount} item verdicts.`);
  }
  const indexes = new Set<number>();
  let allItemsApproved = true;
  value.items.forEach((candidate, position) => {
    if (!isRecord(candidate)) {
      issues.push(`Verdict ${position + 1} must be an object.`);
      allItemsApproved = false;
      return;
    }
    if (
      !Number.isInteger(candidate.requestIndex) ||
      Number(candidate.requestIndex) < 0 ||
      Number(candidate.requestIndex) >= itemCount
    ) {
      issues.push(`Verdict ${position + 1} has an invalid requestIndex.`);
    } else {
      indexes.add(Number(candidate.requestIndex));
    }
    if (typeof candidate.approved !== "boolean") {
      issues.push(`Verdict ${position + 1} approved must be boolean.`);
      allItemsApproved = false;
    } else if (!candidate.approved) {
      allItemsApproved = false;
    }
    if (
      !Array.isArray(candidate.issues) ||
      !candidate.issues.every((item) => typeof item === "string")
    ) {
      issues.push(`Verdict ${position + 1} issues must be strings.`);
    } else if (candidate.approved && candidate.issues.length > 0) {
      issues.push(`Approved verdict ${position + 1} must not contain issues.`);
    } else if (!candidate.approved && candidate.issues.length < 1) {
      issues.push(`Rejected verdict ${position + 1} must explain the issue.`);
    }
  });
  if (indexes.size !== itemCount) {
    issues.push(`requestIndex must cover 0-${Math.max(0, itemCount - 1)} exactly once.`);
  }
  if (typeof value.approved === "boolean" && value.approved !== allItemsApproved) {
    issues.push("Overall approval must equal the approval of every item.");
  }
  return [...new Set(issues)];
}

function questionsForGroup(
  group: ValidatedGroup,
  payload: VocabularyKanjiGroup | GrammarReadingGroup | CommunicationGroup,
): QuestionPayload[] {
  if (group === "vocabulary_and_kanji") {
    return (payload as VocabularyKanjiGroup).vocabularyQuestions;
  }
  if (group === "grammar_and_reading") {
    return (payload as GrammarReadingGroup).grammarQuestions;
  }
  return (payload as CommunicationGroup).listeningExercises;
}

function validationContext(
  library: ResolvedLessonLibrary,
): Record<string, unknown> {
  return {
    kanji: library.kanji.map((item) => ({
      id: item.libraryId,
      character: item.character,
      readings: item.readings,
      meanings: item.meanings,
    })),
    vocabulary: library.vocabulary.map((item) => ({
      id: item.libraryId,
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
      partOfSpeech: item.partOfSpeech,
    })),
    grammar: library.grammar.map((item) => ({
      id: item.libraryId,
      pattern: item.pattern,
      meaning: item.meaning,
      formation: item.formation,
      usageNotes: item.usageNotes,
    })),
  };
}

function groupLabel(group: ValidatedGroup): string {
  if (group === "vocabulary_and_kanji") return "vocabulary and kanji questions";
  if (group === "grammar_and_reading") return "grammar questions";
  return "listening multiple-choice questions";
}

/**
 * A separate approval-only Gemini call. Generated QA stays in memory and is
 * not persisted until every returned item verdict is approved.
 *
 * Reading lines, interactive speaking, and final review are intentionally not
 * judged here in this patch.
 */
export async function approveActivityQuestionsWithAI(input: {
  group: ValidatedGroup;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  payload: VocabularyKanjiGroup | GrammarReadingGroup | CommunicationGroup;
}): Promise<ActivityValidationApproval> {
  const questions = questionsForGroup(input.group, input.payload);
  if (questions.length < 1) {
    throw new Error(`${groupLabel(input.group)} cannot be approved because it is empty.`);
  }

  const indexedQuestions = questions.map((question, requestIndex) => ({
    requestIndex,
    ...question,
  }));
  const prompt = [
    "Act as AIko's strict, approval-only Japanese question-and-answer validator.",
    `Validate ${groupLabel(input.group)} for JLPT ${input.level}.`,
    `Custom topic: ${input.topic}`,
    "The generator output below is provisional. Do not rewrite, repair, replace, reorder, add, or remove questions.",
    "Return exactly one verdict for every requestIndex. Approve an item only when all applicable checks pass:",
    "1. The requested activity format is followed exactly. Multiple choice has four distinct choices and exactly one defensible answer. Text input has a visible Japanese blank and enough context.",
    "2. correctAnswer and acceptedAnswers actually answer the prompt. For a blank, mentally insert the answer and confirm the complete Japanese sentence is grammatical and natural.",
    "3. The question genuinely tests every supplied targetItemId, especially the requested vocabulary or grammar construction, rather than a merely related idea.",
    "4. The item is unambiguous. Do not approve when another choice or answer is also reasonable from the supplied context.",
    "5. The prompt, cue, hint, choices, or surrounding text do not expose the answer before the learner responds.",
    "6. Japanese, English, difficulty, and explanation are appropriate for the JLPT ceiling.",
    "7. For listening, the hidden transcript must contain enough evidence for the prompt and exactly one MCQ answer. The learner answers by MCQ; do not require speaking or STT.",
    "Set approved=false and give concise concrete issues whenever any check fails. An approved item must have an empty issues array.",
    `Fixed story: ${JSON.stringify(input.draft.lines)}`,
    `Canonical lesson library: ${JSON.stringify(validationContext(input.library))}`,
    `Provisional questions: ${JSON.stringify(indexedQuestions)}`,
  ].join("\n");

  const decision = await generateStructured<ValidatorDecision>({
    name: `${groupLabel(input.group)} approval`,
    prompt,
    schema: decisionSchema(questions.length),
    validate: (value) => decisionIssues(value, questions.length),
  });

  if (!decision.value.approved) {
    const details = [...decision.value.items]
      .sort((left, right) => left.requestIndex - right.requestIndex)
      .filter((item) => !item.approved)
      .flatMap((item) =>
        item.issues.map(
          (issue) => `item ${item.requestIndex + 1}: ${issue}`,
        ),
      )
      .slice(0, 12);
    throw new Error(
      `${groupLabel(input.group)} failed AI approval: ${details.join(" | ")}`,
    );
  }

  return {
    model: decision.model,
    repaired: decision.repaired,
    checkedItems: questions.length,
  };
}
