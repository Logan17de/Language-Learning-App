import "server-only";

import {
  generateStructured,
  type JsonSchema,
} from "@/lib/gemini/structured-output";
import type {
  ActivityGroupName,
  CommunicationGroup,
  GrammarReadingGroup,
  ListeningExercise,
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

export type AiValidatedPayload =
  | VocabularyKanjiGroup
  | GrammarReadingGroup
  | CommunicationGroup;

export interface ActivityValidationApproval {
  model: string;
  repaired: boolean;
  checkedItems: number;
  repairedItems: number;
  validationCalls: number;
  payload: AiValidatedPayload;
}

type ValidatedGroup = Exclude<ActivityGroupName, "final_review">;
type QuestionPayload = PracticeQuestion | ListeningExercise;

type IsolatedRepairResult = {
  question: QuestionPayload;
  models: string[];
  validationCalls: number;
};

const MAX_ISOLATED_REPAIR_ATTEMPTS = 3;

function stringArray(minItems = 0, maxItems = 8): JsonSchema {
  return {
    type: "array",
    minItems,
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

function practiceQuestionSchema(group: ValidatedGroup): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "activityType",
      "difficulty",
      "mode",
      "skill",
      "prompt",
      "cue",
      "choices",
      "correctAnswer",
      "acceptedAnswers",
      "explanation",
      "hintFront",
      "hintBack",
      "targetItemIds",
    ],
    properties: {
      activityType: {
        type: "string",
        enum: group === "vocabulary_and_kanji"
          ? ["multiple_choice"]
          : ["multiple_choice", "text_input"],
      },
      difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
      mode: { type: "string" },
      skill: { type: "string", enum: ["understanding", "production"] },
      prompt: { type: "string" },
      cue: { type: "string" },
      choices: stringArray(0, 4),
      correctAnswer: { type: "string" },
      acceptedAnswers: stringArray(1, 5),
      explanation: { type: "string" },
      hintFront: { type: "string" },
      hintBack: { type: "string" },
      targetItemIds: stringArray(1, 5),
    },
  };
}

const listeningQuestionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "difficulty",
    "prompt",
    "transcript",
    "choices",
    "correctAnswer",
    "explanation",
    "targetItemIds",
  ],
  properties: {
    difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
    prompt: { type: "string" },
    transcript: { type: "string" },
    choices: stringArray(4, 4),
    correctAnswer: { type: "string" },
    explanation: { type: "string" },
    targetItemIds: stringArray(1, 5),
  },
};

function questionSchema(group: ValidatedGroup): JsonSchema {
  return group === "listening_and_speaking"
    ? listeningQuestionSchema
    : practiceQuestionSchema(group);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalized(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().toLocaleLowerCase()
    : "";
}

function decisionIssues(value: unknown, itemCount: number): string[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return ["Validator decision must contain item verdicts."];
  }
  const issues: string[] = [];
  if (typeof value.approved !== "boolean") issues.push("approved must be boolean.");
  if (value.items.length !== itemCount) {
    issues.push(`Validator must return exactly ${itemCount} item verdicts.`);
  }
  const indexes = new Set<number>();
  let allApproved = true;
  value.items.forEach((candidate, position) => {
    if (!isRecord(candidate)) {
      issues.push(`Verdict ${position + 1} must be an object.`);
      allApproved = false;
      return;
    }
    const requestIndex = Number(candidate.requestIndex);
    if (!Number.isInteger(requestIndex) || requestIndex < 0 || requestIndex >= itemCount) {
      issues.push(`Verdict ${position + 1} has an invalid requestIndex.`);
    } else {
      indexes.add(requestIndex);
    }
    if (typeof candidate.approved !== "boolean") {
      issues.push(`Verdict ${position + 1} approved must be boolean.`);
      allApproved = false;
    } else if (!candidate.approved) {
      allApproved = false;
    }
    if (!Array.isArray(candidate.issues) || !candidate.issues.every((item) => typeof item === "string")) {
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
  if (typeof value.approved === "boolean" && value.approved !== allApproved) {
    issues.push("Overall approval must equal the approval of every item.");
  }
  return [...new Set(issues)];
}

function questionsForGroup(
  group: ValidatedGroup,
  payload: AiValidatedPayload,
): QuestionPayload[] {
  if (group === "vocabulary_and_kanji") {
    return (payload as VocabularyKanjiGroup).vocabularyQuestions;
  }
  if (group === "grammar_and_reading") {
    return (payload as GrammarReadingGroup).grammarQuestions;
  }
  return (payload as CommunicationGroup).listeningExercises;
}

function allowedLibraryIds(library: ResolvedLessonLibrary): Set<string> {
  return new Set([
    ...library.kanji.map((item) => item.libraryId),
    ...library.vocabulary.map((item) => item.libraryId),
    ...library.grammar.map((item) => item.libraryId),
  ]);
}

function questionStructureIssues(
  group: ValidatedGroup,
  value: unknown,
  library: ResolvedLessonLibrary,
): string[] {
  if (!isRecord(value)) return ["The repaired question must be an object."];
  const issues: string[] = [];
  const targetIds = Array.isArray(value.targetItemIds)
    ? value.targetItemIds.filter((item): item is string => typeof item === "string")
    : [];
  const allowedIds = allowedLibraryIds(library);
  if (targetIds.length < 1 || targetIds.some((id) => !allowedIds.has(id))) {
    issues.push("The repaired question must preserve valid targetItemIds.");
  }

  const choices = Array.isArray(value.choices)
    ? value.choices.filter((item): item is string => typeof item === "string")
    : [];
  const answer = normalized(value.correctAnswer);
  if (!answer) issues.push("The repaired question needs a correctAnswer.");

  if (group === "listening_and_speaking") {
    if (choices.length !== 4 || new Set(choices.map(normalized)).size !== 4) {
      issues.push("A listening repair needs four distinct choices.");
    }
    if (!choices.some((choice) => normalized(choice) === answer)) {
      issues.push("A listening repair must include its correct answer among the choices.");
    }
    if (!normalized(value.transcript)) issues.push("A listening repair needs its hidden transcript.");
    return issues;
  }

  const activityType = value.activityType;
  if (group === "vocabulary_and_kanji" && activityType !== "multiple_choice") {
    issues.push("Vocabulary repairs must remain multiple choice.");
  }
  if (activityType === "multiple_choice") {
    if (choices.length !== 4 || new Set(choices.map(normalized)).size !== 4) {
      issues.push("A multiple-choice repair needs four distinct choices.");
    }
    if (!choices.some((choice) => normalized(choice) === answer)) {
      issues.push("A multiple-choice repair must include its correct answer.");
    }
  } else if (activityType === "text_input") {
    if (choices.length !== 0) issues.push("A text-input repair must not have choices.");
    const stem = typeof value.hintFront === "string" ? value.hintFront.trim() : "";
    if (!/_{2,}|＿{2,}|…/.test(stem)) {
      issues.push("A text-input repair needs a visible Japanese blank in hintFront.");
    }
  } else {
    issues.push("The repaired question has an unsupported activityType.");
  }
  const accepted = Array.isArray(value.acceptedAnswers)
    ? value.acceptedAnswers.filter((item): item is string => typeof item === "string")
    : [];
  if (!accepted.some((item) => normalized(item) === answer)) {
    issues.push("acceptedAnswers must contain the correct answer.");
  }
  return issues;
}

function validationContext(
  library: ResolvedLessonLibrary,
  questions: QuestionPayload[],
): Record<string, unknown> {
  const requestedIds = new Set(questions.flatMap((question) => question.targetItemIds));
  return {
    kanji: library.kanji.filter((item) => requestedIds.has(item.libraryId)).map((item) => ({
      id: item.libraryId,
      character: item.character,
      readings: item.readings,
      meanings: item.meanings,
    })),
    vocabulary: library.vocabulary.filter((item) => requestedIds.has(item.libraryId)).map((item) => ({
      id: item.libraryId,
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
      partOfSpeech: item.partOfSpeech,
    })),
    grammar: library.grammar.filter((item) => requestedIds.has(item.libraryId)).map((item) => ({
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

function approvalPrompt(input: {
  group: ValidatedGroup;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  questions: QuestionPayload[];
}): string {
  return [
    "Act as AIko's strict, approval-only Japanese question-and-answer validator.",
    `Validate ${groupLabel(input.group)} for JLPT ${input.level}.`,
    `Custom topic: ${input.topic}`,
    "Do not rewrite, repair, replace, reorder, add, or remove questions.",
    "Return exactly one verdict for every requestIndex. Approve only when all checks pass:",
    "1. The requested format is exact. MCQ has four distinct choices and one defensible answer. Text input has a visible Japanese blank and enough context.",
    "2. The answer fits the prompt. Mentally insert blank answers and confirm the full sentence is grammatical and natural.",
    "3. The item genuinely tests every supplied targetItemId.",
    "4. The item is unambiguous and no alternative answer is equally reasonable.",
    "5. The prompt, cue, hint, choices, or surrounding text do not expose the answer.",
    "6. Japanese, English, difficulty, and explanation fit the JLPT ceiling.",
    "7. Listening transcript evidence supports exactly one MCQ answer; never require STT.",
    "Rejected items need concise concrete issues. Approved items need an empty issues array.",
    `Fixed story: ${JSON.stringify(input.draft.lines)}`,
    `Relevant canonical library region: ${JSON.stringify(validationContext(input.library, input.questions))}`,
    `Provisional questions: ${JSON.stringify(input.questions.map((question, requestIndex) => ({ requestIndex, ...question })))}`,
  ].join("\n");
}

async function decideQuestions(input: {
  group: ValidatedGroup;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  questions: QuestionPayload[];
}) {
  return generateStructured<ValidatorDecision>({
    name: `${groupLabel(input.group)} approval`,
    prompt: approvalPrompt(input),
    schema: decisionSchema(input.questions.length),
    validate: (value) => decisionIssues(value, input.questions.length),
  });
}

async function repairOneQuestion(input: {
  group: ValidatedGroup;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  question: QuestionPayload;
  requestIndex: number;
  issues: string[];
}): Promise<IsolatedRepairResult> {
  let currentQuestion = input.question;
  let currentIssues = input.issues;
  const models: string[] = [];

  for (let attempt = 1; attempt <= MAX_ISOLATED_REPAIR_ATTEMPTS; attempt += 1) {
    const repaired = await generateStructured<QuestionPayload>({
      name: `single ${groupLabel(input.group)} item repair`,
      prompt: [
        `Repair only item ${input.requestIndex + 1} from AIko's ${groupLabel(input.group)}.`,
        `This is isolated repair attempt ${attempt} of ${MAX_ISOLATED_REPAIR_ATTEMPTS}.`,
        attempt === MAX_ISOLATED_REPAIR_ATTEMPTS
          ? "Rebuild this one question cleanly from its canonical targets rather than making another minimal edit."
          : "Correct every listed issue while preserving all already-valid fields.",
        "Return one corrected question object with no wrapper or explanation.",
        "Do not regenerate, mention, or alter any other question. Approved neighboring questions survive unchanged.",
        "Preserve difficulty, activity type, mode, skill, and targetItemIds unless a listed issue explicitly says one is invalid.",
        `Validator issues: ${JSON.stringify(currentIssues)}`,
        `Fixed story: ${JSON.stringify(input.draft.lines)}`,
        `Relevant canonical library region: ${JSON.stringify(validationContext(input.library, [currentQuestion]))}`,
        `Question to repair: ${JSON.stringify(currentQuestion)}`,
      ].join("\n"),
      schema: questionSchema(input.group),
      validate: (value) => questionStructureIssues(input.group, value, input.library),
    });
    const approval = await decideQuestions({
      group: input.group,
      topic: input.topic,
      level: input.level,
      draft: input.draft,
      library: input.library,
      questions: [repaired.value],
    });
    models.push(repaired.model, approval.model);

    const verdict = approval.value.items[0];
    if (verdict?.approved) {
      return {
        question: repaired.value,
        models,
        validationCalls: attempt * 2,
      };
    }

    currentQuestion = repaired.value;
    currentIssues = verdict?.issues.length
      ? verdict.issues
      : ["The validator did not approve the isolated replacement."];
    console.warn("Custom lesson question repair needs another isolated attempt.", {
      group: input.group,
      requestIndex: input.requestIndex,
      itemNumber: input.requestIndex + 1,
      attempt,
      maxAttempts: MAX_ISOLATED_REPAIR_ATTEMPTS,
      issues: currentIssues,
    });
  }

  const message =
    `${groupLabel(input.group)} item ${input.requestIndex + 1} failed after ` +
    `${MAX_ISOLATED_REPAIR_ATTEMPTS} isolated repairs: ${currentIssues.join(" | ")}`;
  console.error("Custom lesson isolated question repair exhausted.", {
    group: input.group,
    requestIndex: input.requestIndex,
    itemNumber: input.requestIndex + 1,
    attempts: MAX_ISOLATED_REPAIR_ATTEMPTS,
    issues: currentIssues,
  });
  throw new Error(message);
}

/**
 * Group validators run in parallel with the independently generated activity
 * groups. Approved question regions stay untouched. Rejected questions alone
 * are repaired and re-approved in parallel; no already-approved question is
 * sent back to a generator. Each rejected region receives bounded isolated
 * retries before the surrounding group is allowed to fail.
 */
export async function approveActivityQuestionsWithAI(input: {
  group: ValidatedGroup;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  payload: AiValidatedPayload;
}): Promise<ActivityValidationApproval> {
  const questions = questionsForGroup(input.group, input.payload);
  if (questions.length < 1) {
    throw new Error(`${groupLabel(input.group)} cannot be approved because it is empty.`);
  }
  const initial = await decideQuestions({ ...input, questions });
  const rejected = [...initial.value.items]
    .sort((left, right) => left.requestIndex - right.requestIndex)
    .filter((item) => !item.approved);

  if (rejected.length === 0) {
    return {
      model: initial.model,
      repaired: initial.repaired,
      checkedItems: questions.length,
      repairedItems: 0,
      validationCalls: 1,
      payload: input.payload,
    };
  }

  console.info("Custom lesson validator isolated rejected questions.", {
    group: input.group,
    checkedItems: questions.length,
    rejectedItems: rejected.map((item) => ({
      requestIndex: item.requestIndex,
      itemNumber: item.requestIndex + 1,
      issues: item.issues,
    })),
  });

  const repairs = await Promise.all(rejected.map((verdict) => repairOneQuestion({
    group: input.group,
    topic: input.topic,
    level: input.level,
    draft: input.draft,
    library: input.library,
    question: questions[verdict.requestIndex]!,
    requestIndex: verdict.requestIndex,
    issues: verdict.issues,
  })));

  // questions is the original array inside generated.value. Replacing only the
  // rejected indexes means the runner persists the repaired group while every
  // approved object survives byte-for-byte.
  rejected.forEach((verdict, index) => {
    questions[verdict.requestIndex] = repairs[index]!.question;
  });
  const models = new Set([initial.model, ...repairs.flatMap((item) => item.models)]);
  return {
    model: [...models].join(","),
    repaired: true,
    checkedItems: questions.length,
    repairedItems: repairs.length,
    validationCalls:
      1 + repairs.reduce((total, item) => total + item.validationCalls, 0),
    payload: input.payload,
  };
}
