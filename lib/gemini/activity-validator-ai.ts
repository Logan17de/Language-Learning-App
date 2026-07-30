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

function payloadWithQuestions(
  group: ValidatedGroup,
  payload: AiValidatedPayload,
  questions: QuestionPayload[],
): AiValidatedPayload {
  if (group === "vocabulary_and_kanji") {
    return {
      ...(payload as VocabularyKanjiGroup),
      vocabularyQuestions: questions as PracticeQuestion[],
    };
  }
  if (group === "grammar_and_reading") {
    return {
      ...(payload as GrammarReadingGroup),
      grammarQuestions: questions as PracticeQuestion[],
    };
  }
  return {
    ...(payload as CommunicationGroup),
    listeningExercises: questions as ListeningExercise[],
  };
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
  if (
    targetIds.length < 1 ||
    targetIds.some((id) => !allowedIds.has(id))
  ) {
    issues.push("The repaired question must preserve valid targetItemIds.");
  }

  const choices = Array.isArray(value.choices)
    ? value.choices.filter((item): item is string => typeof item === "string")
    : [];
  const correctAnswer = normalized(value.correctAnswer);
  if (!correctAnswer) issues.push("The repaired question needs a correctAnswer.");

  if (group === "listening_and_speaking") {
    if (choices.length !== 4 || new Set(choices.map(normalized)).size !== 4) {
      issues.push("A listening repair needs four distinct choices.");
    }
    if (!choices.some((choice) => normalized(choice) === correctAnswer)) {
      issues.push("A listening repair must include its correct answer among the choices.");
    }
    if (!normalized(value.transcript)) {
      issues.push("A listening repair needs its hidden transcript.");
    }
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
    if (!choices.some((choice) => normalized(choice) === correctAnswer)) {
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

  const acceptedAnswers = Array.isArray(value.acceptedAnswers)
    ? value.acceptedAnswers.filter((item): item is string => typeof item === "string")
    : [];
  if (!acceptedAnswers.some((answer) => normalized(answer) === correctAnswer)) {
    issues.push("acceptedAnswers must contain the correct answer.");
  }
  return issues;
}

function validationContext(
  library: ResolvedLessonLibrary,
  questions?: QuestionPayload[],
): Record<string, unknown> {
  const requestedIds = questions
    ? new Set(questions.flatMap((question) => question.targetItemIds))
    : null;
  const wanted = (id: string) => !requestedIds || requestedIds.has(id);
  return {
    kanji: library.kanji.filter((item) => wanted(item.libraryId)).map((item) => ({
      id: item.libraryId,
      character: item.character,
      readings: item.readings,
      meanings: item.meanings,
    })),
    vocabulary: library.vocabulary.filter((item) => wanted(item.libraryId)).map((item) => ({
      id: item.libraryId,
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
      partOfSpeech: item.partOfSpeech,
    })),
    grammar: library.grammar.filter((item) => wanted(item.libraryId)).map((item) => ({
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
  const indexedQuestions = input.questions.map((question, requestIndex) => ({
    requestIndex,
    ...question,
  }));
  return [
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
    `Relevant canonical library region: ${JSON.stringify(validationContext(input.library, input.questions))}`,
    `Provisional questions: ${JSON.stringify(indexedQuestions)}`,
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
}): Promise<{
  question: QuestionPayload;
  models: string[];
  validationCalls: number;
}> {
  const prompt = [
    `Repair only item ${input.requestIndex + 1} from AIko's ${groupLabel(input.group)}.`,
    "Return exactly one corrected question object and no wrapper or explanation.",
    "Do not regenerate, mention, or alter any other question. Approved neighboring questions survive unchanged.",
    "Preserve the original difficulty, activity type, mode, skill, and targetItemIds unless a listed issue explicitly says one of them is invalid.",
    "Correct every listed issue while keeping exactly one defensible answer and natural JLPT-appropriate Japanese.",
    `Validator issues: ${JSON.stringify(input.issues)}`,
    `Fixed story: ${JSON.stringify(input.draft.lines)}`,
    `Relevant canonical library region: ${JSON.stringify(validationContext(input.library, [input.question]))}`,
    `Question to repair: ${JSON.stringify(input.question)}`,
  ].join("\n");
  const repaired = await generateStructured<QuestionPayload>({
    name: `single ${groupLabel(input.group)} item repair`,
    prompt,
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
  const verdict = approval.value.items[0];
  if (!verdict?.approved) {
    const details = verdict?.issues.join(" | ") || "The repaired question was not approved.";
    throw new Error(
      `${groupLabel(input.group)} item ${input.requestIndex + 1} failed isolated repair: ${details}`,
    );
  }

  return {
    question: repaired.value,
    models: [repaired.model, approval.model],
    validationCalls: 2,
  };
}

/**
 * Each activity group is validated independently while the group generators run
 * in parallel. Approved question regions are retained. Only rejected questions
 * are repaired and re-approved, with those isolated repair calls running in
 * parallel; the generator is never prompted again for already-approved items.
 *
 * Reading lines, interactive speaking, and final review are intentionally not
 * judged here.
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

  const initial = await decideQuestions({
    group: input.group,
    topic: input.topic,
    level: input.level,
    draft: input.draft,
    library: input.library,
    questions,
  });
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

  const repairs = await Promise.all(
    rejected.map((verdict) => repairOneQuestion({
      group: input.group,
      topic: input.topic,
      level: input.level,
      draft: input.draft,
      library: input.library,
      question: questions[verdict.requestIndex]!,
      requestIndex: verdict.requestIndex,
      issues: verdict.issues,
    })),
  );
  const repairedQuestions = [...questions];
  rejected.forEach((verdict, index) => {
    repairedQuestions[verdict.requestIndex] = repairs[index]!.question;
  });
  const models = new Set([
    initial.model,
    ...repairs.flatMap((repair) => repair.models),
  ]);

  return {
    model: [...models].join(","),
    repaired: true,
    checkedItems: questions.length,
    repairedItems: repairs.length,
    validationCalls: 1 + repairs.reduce(
      (total, repair) => total + repair.validationCalls,
      0,
    ),
    payload: payloadWithQuestions(input.group, input.payload, repairedQuestions),
  };
}
