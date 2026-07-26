import "server-only";

import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";
import {
  createGeminiApiError,
  GeminiApiError,
  getGeminiApiDiagnostics,
} from "@/lib/gemini/api-error";
import {
  buildGenerateContentRequest,
  buildInteractionsRequest,
  generateContentUrl,
} from "@/lib/gemini/api-request";
import {
  createInspectableTermLookup,
  resolveInspectableTerm,
  type InspectableTermLookup,
} from "@/lib/gemini/inspectable-canonicalization";
import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";
import {
  blueprintSchema,
  grammarSchema,
  interactiveSchema,
  lessonLibrarySeedSchema,
  listeningSchema,
  readingSchema,
  speakingSchema,
  storySchema,
  vocabularySchema,
} from "@/lib/gemini/lesson-schemas";
import type {
  ExerciseSection,
  GenerationAttempt,
  GenerationSectionName,
  InspectableTerm,
  InteractiveSection,
  LessonBlueprint,
  LessonGenerationInput,
  LessonLibrarySeed,
  ListeningSection,
  ReadingSection,
  SpeakingSection,
  StorySection,
  UniversalExercise,
  UniversalLessonPackage,
  VocabularyLibraryItem,
} from "@/lib/gemini/lesson-types";

const PRIMARY_MODEL = process.env.GEMINI_LESSON_MODEL?.trim() || "gemini-3-flash-preview";
const FALLBACK_MODEL = process.env.GEMINI_LESSON_FALLBACK_MODEL?.trim() || "gemini-3.1-flash-lite";
const GEMINI_GENERATE_CONTENT_BASE = process.env.GEMINI_GENERATE_CONTENT_BASE?.trim()
  || "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_INTERACTIONS_ENDPOINT = process.env.GEMINI_API_BASE?.trim()
  || "https://generativelanguage.googleapis.com/v1beta/interactions";

type JsonSchema = Record<string, unknown>;
type RecordValue = Record<string, unknown>;

interface GeminiResult {
  value: unknown;
  model: string;
}

interface SectionDefinition {
  name: GenerationSectionName;
  schema: JsonSchema;
  prompt: string;
  validate: (value: unknown) => string[];
}

interface SectionResult<T> {
  value: T;
  attempts: GenerationAttempt[];
}

interface GeminiHttpResult {
  response: Response;
  payload: unknown;
  transport: "generateContent" | "interactions";
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function findOutputText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOutputText(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const key of ["output_text", "outputText", "text"]) {
    if (typeof value[key] === "string") return value[key];
  }
  if (Array.isArray(value.steps)) {
    for (const step of [...value.steps].reverse()) {
      if (isRecord(step) && step.type === "model_output") {
        const found = findOutputText(step.content);
        if (found) return found;
      }
    }
  }
  for (const key of ["candidates", "outputs", "output", "content", "parts", "response"]) {
    if (key in value) {
      const found = findOutputText(value[key]);
      if (found) return found;
    }
  }
  return null;
}

async function postGemini(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  transport: GeminiHttpResult["transport"],
  includeApiRevision = false,
): Promise<GeminiHttpResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      ...(includeApiRevision ? { "Api-Revision": "2026-05-20" } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  return {
    response,
    payload: await response.json().catch(() => null),
    transport,
  };
}

function shouldUseInteractionsFallback(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

function reportGeminiRejection(model: string, result: GeminiHttpResult): void {
  const diagnostics = getGeminiApiDiagnostics(result.payload);
  console.error("Gemini structured request rejected.", {
    model,
    transport: result.transport,
    status: result.response.status,
    messages: diagnostics.messages.slice(0, 3),
    reasons: diagnostics.reasons.slice(0, 3),
    fields: diagnostics.fields.slice(0, 5),
    descriptions: diagnostics.descriptions.slice(0, 3),
  });
}

async function callModel(model: string, prompt: string, schema: JsonSchema): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  let result = await postGemini(
    generateContentUrl(GEMINI_GENERATE_CONTENT_BASE, model),
    apiKey,
    buildGenerateContentRequest(prompt, schema),
    "generateContent",
  );
  if (!result.response.ok && shouldUseInteractionsFallback(result.response.status)) {
    result = await postGemini(
      GEMINI_INTERACTIONS_ENDPOINT,
      apiKey,
      buildInteractionsRequest(model, prompt, schema),
      "interactions",
      true,
    );
  }
  if (!result.response.ok) {
    reportGeminiRejection(model, result);
    throw createGeminiApiError(model, result.response.status, result.payload);
  }

  const output = findOutputText(result.payload);
  if (output) {
    try {
      return JSON.parse(output);
    } catch {
      throw new Error(`${model} returned malformed JSON.`);
    }
  }
  if (isRecord(result.payload)
    && !("candidates" in result.payload)
    && !("outputs" in result.payload)
    && !("output" in result.payload)) {
    return result.payload;
  }
  throw new Error(`${model} did not return structured output.`);
}

async function callGemini(prompt: string, schema: JsonSchema): Promise<GeminiResult> {
  try {
    return { value: await callModel(PRIMARY_MODEL, prompt, schema), model: PRIMARY_MODEL };
  } catch (primaryError) {
    if (primaryError instanceof GeminiApiError && !primaryError.allowFallback) {
      throw primaryError;
    }
    if (FALLBACK_MODEL === PRIMARY_MODEL) throw primaryError;
    try {
      return { value: await callModel(FALLBACK_MODEL, prompt, schema), model: FALLBACK_MODEL };
    } catch (fallbackError) {
      const primary = primaryError instanceof Error ? primaryError.message : "Primary Gemini request failed.";
      const fallback = fallbackError instanceof Error ? fallbackError.message : "Fallback Gemini request failed.";
      throw new Error(`Lesson generation failed on both Gemini models. Primary: ${primary} Fallback: ${fallback}`);
    }
  }
}

function repairPrompt(section: GenerationSectionName, prompt: string, value: unknown, issues: string[]): string {
  return [
    prompt,
    "",
    `The previous ${section} output passed the API schema but failed application validation.`,
    "Return the COMPLETE corrected section, not a patch and not an explanation.",
    "Validation issues:",
    ...issues.map((issue) => `- ${issue}`),
    "Previous output:",
    JSON.stringify(value),
  ].join("\n");
}

async function generateSection<T>(definition: SectionDefinition): Promise<SectionResult<T>> {
  const attempts: GenerationAttempt[] = [];
  const first = await callGemini(definition.prompt, definition.schema);
  const firstIssues = definition.validate(first.value);
  attempts.push({ section: definition.name, model: first.model, repaired: false, issues: firstIssues });
  if (firstIssues.length === 0) return { value: first.value as T, attempts };

  const repaired = await callGemini(
    repairPrompt(definition.name, definition.prompt, first.value, firstIssues),
    definition.schema,
  );
  const repairIssues = definition.validate(repaired.value);
  attempts.push({ section: definition.name, model: repaired.model, repaired: true, issues: repairIssues });
  if (repairIssues.length > 0) {
    throw new Error(`Gemini could not repair ${definition.name}: ${repairIssues.join(" ")}`);
  }
  return { value: repaired.value as T, attempts };
}

function promptHeader(input: LessonGenerationInput): string {
  return [
    "You are AIko's Japanese lesson generation engine.",
    "Return only the structured JSON required by the supplied response schema.",
    `Learner level: ${input.level}. Never exceed this JLPT level.`,
    `Topic: ${input.topic}`,
    `Interests: ${input.interests.join(", ") || "none supplied"}`,
    `Duration: ${input.durationMinutes} minutes`,
    `Focus: ${input.focus}`,
    `Speaking difficulty preference: ${input.speakingDifficulty}`,
    `Tone: ${input.tone}. Keep feedback and learner-facing instructions warm, calm, and encouraging.`,
    `Learner note: ${input.note || "none"}`,
    "Use all 5 target kanji and all 3 target grammar patterns naturally.",
    "Use only supplied kanji, grammar, and vocabulary library IDs in reference fields.",
    "Do not invent readings or meanings. Copy them from the library.",
    "Japanese question/prompt content may expose inspectable terms; answerData and model answers must never be inspectable.",
    "Keep questionContent and answerData separate. Never leak a correct answer into an instruction, hint, or inspectable term.",
    "Do not add furigana or readings in parentheses to Japanese text. The renderer adds surface（reading） only for kanji outside the learner's known-kanji list.",
    "Do not mention databases, local storage, schemas, scoring implementation, or AI generation to the learner.",
    "Every meaningful Japanese content word or kanji shown in question content must reference its matching supplied library ID in the relevant inspectable-terms array.",
  ].join("\n");
}

function librarySeedIssues(
  value: unknown,
  requiredKanji: string[],
  requiredGrammar: string[],
): string[] {
  if (!isRecord(value)) return ["Library seed must be an object."];
  const kanji = Array.isArray(value.kanji) ? value.kanji : [];
  const grammar = Array.isArray(value.grammar) ? value.grammar : [];
  const vocabulary = Array.isArray(value.vocabulary) ? value.vocabulary : [];
  const issues: string[] = [];
  if (kanji.length !== 5) issues.push(`Library seed requires 5 kanji; received ${kanji.length}.`);
  if (grammar.length !== 3) issues.push(`Library seed requires 3 grammar records; received ${grammar.length}.`);
  if (vocabulary.length < 24 || vocabulary.length > 36) {
    issues.push(`Library seed requires 24-36 vocabulary records; received ${vocabulary.length}.`);
  }
  const unique = (items: unknown[], key: string) =>
    new Set(items.flatMap((item) =>
      isRecord(item) && stringValue(item[key]) ? [item[key] as string] : []));
  if (unique(kanji, "character").size !== kanji.length) issues.push("Generated kanji must be unique.");
  if (unique(grammar, "pattern").size !== grammar.length) issues.push("Generated grammar patterns must be unique.");
  const generatedKanji = unique(kanji, "character");
  const generatedGrammar = unique(grammar, "pattern");
  if (requiredKanji.some((character) => !generatedKanji.has(character))) {
    issues.push("Generated kanji must exactly cover the engine-selected kanji catalog entries.");
  }
  if (requiredGrammar.some((pattern) => !generatedGrammar.has(pattern))) {
    issues.push("Generated grammar must exactly cover the engine-selected grammar catalog entries.");
  }
  if (unique(vocabulary, "writtenForm").size < Math.min(20, vocabulary.length)) {
    issues.push("Generated vocabulary contains too many duplicate written forms.");
  }
  return issues;
}

export async function generateLessonLibrarySeed(input: {
  topic: string;
  level: JLPTLevel;
  requiredKanji: string[];
  requiredGrammar: string[];
  existingKanji: string[];
  existingGrammar: string[];
  existingVocabulary: string[];
}): Promise<LessonLibrarySeed> {
  if (input.requiredKanji.length !== 5 || input.requiredGrammar.length !== 3) {
    throw new Error("Library enrichment requires exactly 5 catalog kanji and 3 catalog grammar patterns.");
  }
  const prompt = [
    "You maintain AIko's reusable Japanese learning library.",
    "Return only the structured JSON required by the supplied response schema.",
    `Create level-appropriate reusable records for JLPT ${input.level}. Do not exceed that level.`,
    `The immediate lesson topic is: ${input.topic}`,
    "Create detailed records for exactly the 5 engine-selected kanji and exactly the 3 engine-selected grammar patterns listed below.",
    "Do not replace, omit, normalize, combine, or invent any selected kanji or grammar pattern.",
    `Required kanji (exact): ${JSON.stringify(input.requiredKanji)}`,
    `Required grammar patterns (exact): ${JSON.stringify(input.requiredGrammar)}`,
    "Also create 24-36 vocabulary records.",
    "Prefer words that support the topic while remaining broadly reusable in future lessons.",
    "Readings must be kana, meanings must be concise English, and examples must be natural Japanese.",
    "Vocabulary linkedKanjiCharacters may contain only characters included in the kanji output or the existing kanji list.",
    `Existing detailed kanji available for vocabulary linking: ${JSON.stringify(input.existingKanji)}`,
    `Existing detailed grammar patterns: ${JSON.stringify(input.existingGrammar)}`,
    `Avoid duplicating these vocabulary forms: ${JSON.stringify(input.existingVocabulary)}`,
  ].join("\n");
  const result = await generateSection<LessonLibrarySeed>({
    name: "blueprint",
    schema: lessonLibrarySeedSchema,
    prompt,
    validate: (value) => librarySeedIssues(value, input.requiredKanji, input.requiredGrammar),
  });
  return result.value;
}

function targetContext(input: LessonGenerationInput): string {
  return JSON.stringify({
    targetKanji: input.targets.kanji,
    targetGrammar: input.targets.grammar,
    knownKanji: input.targets.knownKanji,
  });
}

function vocabularyContext(vocabulary: VocabularyLibraryItem[]): string {
  return JSON.stringify(vocabulary.map((item) => ({
    id: item.id,
    writtenForm: item.writtenForm,
    reading: item.reading,
    meaning: item.meaning,
    partOfSpeech: item.partOfSpeech,
    level: item.level,
    tags: item.tags,
    exampleSentence: item.exampleSentence,
  })));
}

function baseValidation(value: unknown, requiredKeys: string[]): string[] {
  if (!isRecord(value)) return ["Output must be an object."];
  return requiredKeys.filter((key) => !(key in value)).map((key) => `Missing ${key}.`);
}

function countDifficulties(exercises: UniversalExercise[]): Record<"easy" | "medium" | "hard", number> {
  return exercises.reduce((counts, exercise) => {
    if (exercise.difficulty in counts) counts[exercise.difficulty] += 1;
    return counts;
  }, { easy: 0, medium: 0, hard: 0 });
}

function exerciseIssues(value: unknown, expectedCount: number): string[] {
  const issues = baseValidation(value, ["exercises"]);
  if (!isRecord(value) || !Array.isArray(value.exercises)) return [...issues, "exercises must be an array."];
  const exercises = value.exercises as UniversalExercise[];
  if (exercises.length !== expectedCount) issues.push(`Expected ${expectedCount} exercises, received ${exercises.length}.`);
  const ids = new Set<string>();
  for (const exercise of exercises) {
    if (!isRecord(exercise) || !stringValue(exercise.id)) {
      issues.push("Every exercise needs a non-empty id.");
      continue;
    }
    if (ids.has(exercise.id)) issues.push(`Duplicate exercise id ${exercise.id}.`);
    ids.add(exercise.id);
    const question = isRecord(exercise.questionContent) ? exercise.questionContent : null;
    const answer = isRecord(exercise.answerData) ? exercise.answerData : null;
    if (!question || !answer || !stringValue(answer.correctAnswer)) {
      issues.push(`${exercise.id} is missing questionContent or answerData.`);
      continue;
    }
    const choices = Array.isArray(question.choices)
      ? question.choices.filter((choice): choice is string => typeof choice === "string")
      : [];
    if (choices.length > 0 && !choices.includes(answer.correctAnswer)) {
      issues.push(`${exercise.id} correctAnswer must exactly match one choice.`);
    }
    if ((exercise.difficulty === "medium" || exercise.difficulty === "hard")
      && (!stringValue(question.hintFront) || !stringValue(question.hintBack))) {
      issues.push(`${exercise.id} must have both partial-sentence hints.`);
    }
  }
  const counts = countDifficulties(exercises);
  if (expectedCount === 20 && (counts.easy !== 8 || counts.medium !== 7 || counts.hard !== 5)) {
    issues.push(`Difficulty split must be 8 easy, 7 medium, 5 hard; received ${counts.easy}/${counts.medium}/${counts.hard}.`);
  }
  return issues;
}

function blueprintIssues(value: unknown, input: LessonGenerationInput): string[] {
  const issues = baseValidation(value, [
    "title", "japaneseTitle", "summary", "setting", "characters", "storySummary",
    "learningObjectives", "coreVocabularyIds",
  ]);
  if (!isRecord(value)) return issues;
  const allowedIds = new Set(input.targets.vocabulary.map((item) => item.id));
  const ids = Array.isArray(value.coreVocabularyIds)
    ? value.coreVocabularyIds.filter((item): item is string => typeof item === "string")
    : [];
  if (ids.length < 10 || ids.length > 18) issues.push("coreVocabularyIds must contain 10 to 18 IDs.");
  for (const id of ids) if (!allowedIds.has(id)) issues.push(`Unknown core vocabulary ID ${id}.`);
  if (new Set(ids).size !== ids.length) issues.push("coreVocabularyIds must be unique.");
  return issues;
}

function storyIssues(value: unknown, input: LessonGenerationInput): string[] {
  const issues = baseValidation(value, ["preview", "lines"]);
  if (!isRecord(value) || !Array.isArray(value.lines)) return [...issues, "lines must be an array."];
  if (value.lines.length !== 20) issues.push(`Story must contain exactly 20 lines; received ${value.lines.length}.`);
  const japanese = value.lines
    .map((line) => isRecord(line) && typeof line.japanese === "string" ? line.japanese : "")
    .join("");
  for (const kanji of input.targets.kanji) {
    if (!japanese.includes(kanji.character)) issues.push(`Story does not use target kanji ${kanji.character}.`);
  }
  for (const grammar of input.targets.grammar) {
    if (!storyUsesGrammarPattern(japanese, grammar.pattern)) {
      issues.push(`Story does not visibly use target grammar ${grammar.pattern}.`);
    }
  }
  const paragraphs = new Set(
    value.lines.map((line) => isRecord(line) && typeof line.paragraph === "number" ? line.paragraph : 0),
  );
  if (paragraphs.size < 3) issues.push("Story must be arranged into at least 3 passage paragraphs.");
  return issues;
}

function exactArrayIssues(value: unknown, key: string, count: number): string[] {
  const issues = baseValidation(value, [key]);
  if (!isRecord(value) || !Array.isArray(value[key])) return [...issues, `${key} must be an array.`];
  if (value[key].length !== count) issues.push(`${key} must contain exactly ${count} items.`);
  return issues;
}

function referenceIssues(value: unknown, input: LessonGenerationInput): string[] {
  const issues: string[] = [];
  const inspectables = inspectableLookup(input);
  const inspectableIds = new Set(inspectables.byId.keys());
  const targetIds = new Set([
    ...inspectableIds,
    ...input.targets.grammar.map((item) => item.id),
  ]);
  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      if ((key === "inspectableTerms" || key === "transcriptTerms" || key === "promptTerms")
        && Array.isArray(child)) {
        // Inspectable metadata is canonicalized after generation. A model-created
        // ID is acceptable when its surface or reading maps to the supplied
        // reusable library; unresolved metadata is safely omitted.
        continue;
      } else if (key === "targetIds" && Array.isArray(child)) {
        for (const id of child) {
          if (typeof id !== "string" || !targetIds.has(id)) {
            issues.push(`Unknown exercise target ID ${typeof id === "string" ? id : "(missing)"}.`);
          }
        }
      } else {
        visit(child);
      }
    }
  }
  visit(value);
  return [...new Set(issues)];
}

function listeningIssues(value: unknown): string[] {
  const issues = exactArrayIssues(value, "sets", 3);
  if (!isRecord(value) || !Array.isArray(value.sets)) return issues;
  const difficulties = new Set<string>();
  for (const set of value.sets) {
    if (!isRecord(set)) continue;
    if (typeof set.difficulty === "string") difficulties.add(set.difficulty);
    if (!Array.isArray(set.questions) || set.questions.length !== 3) issues.push("Each listening set needs exactly 3 questions.");
    else {
      for (const question of set.questions) {
        const wrapped = { exercises: [question] };
        issues.push(...exerciseIssues(wrapped, 1));
      }
    }
  }
  for (const difficulty of ["easy", "medium", "hard"]) {
    if (!difficulties.has(difficulty)) issues.push(`Listening needs one ${difficulty} set.`);
  }
  return issues;
}

function speakingIssues(value: unknown): string[] {
  const issues = exactArrayIssues(value, "tasks", 9);
  if (!isRecord(value) || !Array.isArray(value.tasks)) return issues;
  const counts = countDifficulties(value.tasks as UniversalExercise[]);
  if (counts.easy !== 3 || counts.medium !== 3 || counts.hard !== 3) {
    issues.push(`Speaking split must be 3/3/3; received ${counts.easy}/${counts.medium}/${counts.hard}.`);
  }
  return issues;
}

function interactiveIssues(value: unknown): string[] {
  const issues = exactArrayIssues(value, "turns", 8);
  if (!isRecord(value) || !Array.isArray(value.turns)) return issues;
  const counts = countDifficulties(value.turns as UniversalExercise[]);
  if (counts.easy < 2 || counts.medium < 2 || counts.hard < 2) {
    issues.push("Interactive practice needs at least 2 easy, 2 medium, and 2 hard turns.");
  }
  return issues;
}

function inspectableLookup(input: LessonGenerationInput): InspectableTermLookup {
  const terms: InspectableTerm[] = [];
  for (const item of input.targets.vocabulary) {
    const scriptType = /[\u4e00-\u9faf]/u.test(item.writtenForm)
      ? "kanji"
      : /[\u30a0-\u30ff]/u.test(item.writtenForm) ? "katakana" : "hiragana";
    terms.push({
      libraryId: item.id,
      surface: item.writtenForm,
      reading: item.reading,
      meaning: item.meaning,
      scriptType,
    });
  }
  for (const item of input.targets.kanji) {
    terms.push({
      libraryId: item.id,
      surface: item.character,
      reading: item.readings.join("・"),
      meaning: item.meanings.join("; "),
      scriptType: "kanji",
    });
  }
  return createInspectableTermLookup(terms);
}

function canonicalizeTerms(value: unknown, lookup: InspectableTermLookup): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalizeTerms(item, lookup));
  if (!isRecord(value)) return value;
  const result: RecordValue = {};
  for (const [key, child] of Object.entries(value)) {
    if ((key === "inspectableTerms" || key === "transcriptTerms" || key === "promptTerms") && Array.isArray(child)) {
      result[key] = child.flatMap((term) => {
        const canonical = resolveInspectableTerm(term, lookup);
        if (!canonical) return [];
        return [canonical];
      });
    } else {
      result[key] = canonicalizeTerms(child, lookup);
    }
  }
  return result;
}

function buildBlueprintPrompt(input: LessonGenerationInput): string {
  return [
    promptHeader(input),
    "Create the shared blueprint first. Every later section will use it.",
    "Choose 10-18 coreVocabularyIds from the supplied library. Do not write lesson exercises yet.",
    `Targets: ${targetContext(input)}`,
    `Vocabulary library: ${vocabularyContext(input.targets.vocabulary)}`,
  ].join("\n\n");
}

function buildStoryPrompt(
  input: LessonGenerationInput,
  blueprint: LessonBlueprint,
  coreVocabulary: VocabularyLibraryItem[],
): string {
  return [
    promptHeader(input),
    "Generate the lesson story from the approved blueprint.",
    "Write exactly 20 natural story lines arranged into 3-6 passage paragraphs using the paragraph number.",
    "This is silent story reading: do not include speaking prompts, read-aloud instructions, audio controls, or dialogue labels.",
    "Use all target kanji and grammar. Attach only genuinely present inspectable words.",
    `Blueprint: ${JSON.stringify(blueprint)}`,
    `Targets: ${targetContext(input)}`,
    `Allowed story vocabulary: ${vocabularyContext(coreVocabulary)}`,
  ].join("\n\n");
}

function sectionContext(
  input: LessonGenerationInput,
  blueprint: LessonBlueprint,
  story: StorySection,
  vocabulary: VocabularyLibraryItem[],
): string {
  return [
    `Blueprint: ${JSON.stringify(blueprint)}`,
    `Story: ${JSON.stringify(story)}`,
    `Targets: ${targetContext(input)}`,
    `Allowed vocabulary: ${vocabularyContext(vocabulary)}`,
  ].join("\n");
}

function buildVocabularyPrompt(
  input: LessonGenerationInput,
  blueprint: LessonBlueprint,
  story: StorySection,
  vocabulary: VocabularyLibraryItem[],
): string {
  return [
    promptHeader(input),
    "Generate exactly 20 kanji/vocabulary exercises: 8 easy, 7 medium, 5 hard.",
    "Progress from meaning/reading recognition to contextual usage, production, and whole-sentence work.",
    "Use varied formats. Multiple-choice correctAnswer must exactly equal one choice.",
    "For kanji, distinguish meaning, recognition, and pronunciation in targetIds/criteria. Kana words use meaning and recognition as the same signal.",
    "Hints are required for medium and hard questions and must reveal only partial front/back sentence fragments.",
    sectionContext(input, blueprint, story, vocabulary),
  ].join("\n\n");
}

function buildGrammarPrompt(
  input: LessonGenerationInput,
  blueprint: LessonBlueprint,
  story: StorySection,
  vocabulary: VocabularyLibraryItem[],
): string {
  return [
    promptHeader(input),
    "Generate exactly 20 grammar exercises: 8 easy, 7 medium, 5 hard.",
    "Easy: small conjunctions, connecting words, and particles. Medium: difficult particle placement and the 3 target patterns.",
    "Hard: translate or create complete sentences using the target patterns.",
    "Use varied recognition, fill-blank, ordering, error-correction, contextual selection, translation, and creation formats.",
    "Hints are required for medium and hard questions and must show only partial front/back sentence fragments.",
    "Do not create a common-mistake box or a commonMistake field.",
    sectionContext(input, blueprint, story, vocabulary),
  ].join("\n\n");
}

function buildReadingPrompt(
  input: LessonGenerationInput,
  blueprint: LessonBlueprint,
  story: StorySection,
  vocabulary: VocabularyLibraryItem[],
): string {
  return [
    promptHeader(input),
    "Generate a separate 6-line reading conversation based on the same setting, characters, targets, and story facts.",
    "Keep translations accurate and attach inspectable terms only to Japanese question content.",
    sectionContext(input, blueprint, story, vocabulary),
  ].join("\n\n");
}

function buildListeningPrompt(
  input: LessonGenerationInput,
  blueprint: LessonBlueprint,
  story: StorySection,
  vocabulary: VocabularyLibraryItem[],
): string {
  return [
    promptHeader(input),
    "Generate 3 distinct listening sets: one easy, one medium, one hard.",
    "Each set needs a natural TTS-ready Japanese transcript and exactly 3 questions with hidden answerData.",
    "Questions may test detail, inference, grammar, and intent. Multiple-choice answers must exactly match a choice.",
    sectionContext(input, blueprint, story, vocabulary),
  ].join("\n\n");
}

function buildSpeakingPrompt(
  input: LessonGenerationInput,
  blueprint: LessonBlueprint,
  story: StorySection,
  vocabulary: VocabularyLibraryItem[],
): string {
  return [
    promptHeader(input),
    "Generate exactly 9 speaking tasks: 3 easy, 3 medium, 3 hard.",
    "Easy tasks are read/repeat or short controlled answers. Medium tasks complete or transform sentences.",
    "Hard tasks require original contextual responses.",
    "Semantic criteria must evaluate intended meaning and acceptable grammar, never exact string equality.",
    sectionContext(input, blueprint, story, vocabulary),
  ].join("\n\n");
}

function buildInteractivePrompt(
  input: LessonGenerationInput,
  blueprint: LessonBlueprint,
  story: StorySection,
  vocabulary: VocabularyLibraryItem[],
): string {
  return [
    promptHeader(input),
    "Generate exactly 8 turns for a controlled listening-and-speaking conversation tree.",
    "Include at least 2 easy, 2 medium, and 2 hard turns.",
    "For every AI prompt provide concepts, 2-4 varied acceptable example answers, and semantic evaluation criteria.",
    "The evaluator must accept contextually correct answers even when wording differs from examples.",
    sectionContext(input, blueprint, story, vocabulary),
  ].join("\n\n");
}

function uniqueById(items: VocabularyLibraryItem[]): VocabularyLibraryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildLegacyReviewQuestions(exercises: UniversalExercise[]) {
  const answerPool = [...new Set(exercises.map((exercise) => exercise.answerData.correctAnswer).filter(Boolean))];
  return exercises.slice(0, 10).map((exercise, index) => {
    const supplied = exercise.questionContent.choices;
    const distractors = answerPool.filter((answer) => answer !== exercise.answerData.correctAnswer).slice(index % 3, (index % 3) + 3);
    const choices = supplied.length >= 2
      ? supplied
      : [exercise.answerData.correctAnswer, ...distractors].slice(0, 4);
    if (!choices.includes(exercise.answerData.correctAnswer)) choices.unshift(exercise.answerData.correctAnswer);
    return {
      id: exercise.id,
      prompt: exercise.questionContent.japanese || exercise.questionContent.englishPrompt || exercise.questionContent.instruction,
      choices,
      correctAnswer: exercise.answerData.correctAnswer,
      explanation: exercise.answerData.explanation,
      questionType: "multiple-choice",
    };
  });
}

function legacyPackage(input: LessonGenerationInput, universal: UniversalLessonPackage): Json {
  const vocabularyById = new Map(input.targets.vocabulary.map((item) => [item.id, item]));
  const coreVocabulary = universal.blueprint.coreVocabularyIds
    .map((id) => vocabularyById.get(id))
    .filter((item): item is VocabularyLibraryItem => Boolean(item))
    .slice(0, 12);
  const allReviewExercises = [
    ...universal.vocabulary.exercises.slice(0, 5),
    ...universal.grammar.exercises.slice(0, 5),
  ];
  const reviewQuestions = buildLegacyReviewQuestions(allReviewExercises);
  const listeningExercises = universal.listening.sets.flatMap((set) => set.questions.map((question) => ({
    id: question.id,
    prompt: question.questionContent.japanese || question.questionContent.englishPrompt,
    transcript: set.transcript,
    choices: question.questionContent.choices,
    correctAnswer: question.answerData.correctAnswer,
    explanation: question.answerData.explanation,
    questionType: "multiple-choice",
  })));

  return {
    title: universal.blueprint.title,
    japaneseTitle: universal.blueprint.japaneseTitle,
    summary: universal.blueprint.summary,
    storyPreview: universal.story.preview,
    tags: [input.level, input.topic, ...input.interests].slice(0, 8),
    reviewItems: [
      ...input.targets.kanji.map((item) => item.character),
      ...input.targets.grammar.map((item) => item.pattern),
    ],
    story: universal.story.lines.map((line) => ({
      japanese: line.japanese,
      english: line.english,
      tappableTerms: line.inspectableTerms.map((term) => term.surface),
    })),
    vocabulary: coreVocabulary.map((item) => ({
      term: item.writtenForm,
      reading: item.reading,
      meaning: item.meaning,
      partOfSpeech: item.partOfSpeech,
      exampleSentence: item.exampleSentence,
    })),
    grammar: input.targets.grammar.map((item) => ({
      pattern: item.pattern,
      meaning: item.meaning,
      structure: item.formation,
      usage: item.usageNotes,
      example: item.examples[0] ?? "",
      translation: item.nuance || item.meaning,
      commonMistake: "",
    })),
    readingConversation: universal.reading.lines.map((line) => ({
      speaker: line.speaker,
      japanese: line.japanese,
      english: line.english,
    })),
    listeningExercises,
    speakingExercises: universal.speaking.tasks.map((task) => ({
      id: task.id,
      mode: task.difficulty,
      prompt: task.prompt,
      easyPrompt: task.difficulty === "easy" ? task.prompt : "",
      mediumPrompt: task.difficulty === "medium" ? task.prompt : "",
      hardPrompt: task.difficulty === "hard" ? task.prompt : "",
      expectedAnswer: task.expectedConcepts.join("; "),
      modelAnswer: task.modelAnswer,
    })),
    reviewQuestions,
    answerKeys: reviewQuestions.map((question) => question.correctAnswer),
    phases: [
      { id: "story", label: "Story", description: "Read the lesson story in context." },
      { id: "vocabulary", label: "Words & kanji", description: "Build meaning, recognition, and pronunciation." },
      { id: "grammar", label: "Grammar", description: "Use the lesson patterns from easy to hard." },
      { id: "reading", label: "Reading", description: "Read a connected conversation." },
      { id: "listening", label: "Listening", description: "Understand natural Japanese audio." },
      { id: "speaking", label: "Speaking", description: "Respond with guided and original speech." },
      { id: "review", label: "Review", description: "Check the lesson's strongest and weakest points." },
    ],
    generationPackage: universal as unknown as Json,
  };
}

export async function generateLessonPackage(input: LessonGenerationInput): Promise<Json> {
  if (input.targets.kanji.length !== 5 || input.targets.grammar.length !== 3) {
    throw new Error("Lesson generation requires exactly 5 target kanji and 3 target grammar patterns.");
  }

  const blueprintResult = await generateSection<LessonBlueprint>({
    name: "blueprint",
    schema: blueprintSchema,
    prompt: buildBlueprintPrompt(input),
    validate: (value) => blueprintIssues(value, input),
  });
  const vocabularyById = new Map(input.targets.vocabulary.map((item) => [item.id, item]));
  const coreVocabulary = uniqueById([
    ...blueprintResult.value.coreVocabularyIds
      .map((id) => vocabularyById.get(id))
      .filter((item): item is VocabularyLibraryItem => Boolean(item)),
    ...input.targets.vocabulary.filter((item) =>
      input.targets.kanji.some((kanji) => item.writtenForm.includes(kanji.character))),
  ]).slice(0, 24);

  const storyResult = await generateSection<StorySection>({
    name: "story",
    schema: storySchema,
    prompt: buildStoryPrompt(input, blueprintResult.value, coreVocabulary),
    validate: (value) => [...storyIssues(value, input), ...referenceIssues(value, input)],
  });
  const usedIds = new Set(storyResult.value.lines.flatMap((line) =>
    line.inspectableTerms.map((term) => term.libraryId)));
  const sectionVocabulary = uniqueById([
    ...coreVocabulary,
    ...input.targets.vocabulary.filter((item) => usedIds.has(item.id)),
  ]).slice(0, 40);

  const [vocabularyResult, grammarResult, readingResult, listeningResult, speakingResult, interactiveResult] =
    await Promise.all([
      generateSection<ExerciseSection>({
        name: "vocabulary",
        schema: vocabularySchema,
        prompt: buildVocabularyPrompt(input, blueprintResult.value, storyResult.value, sectionVocabulary),
        validate: (value) => [...exerciseIssues(value, 20), ...referenceIssues(value, input)],
      }),
      generateSection<ExerciseSection>({
        name: "grammar",
        schema: grammarSchema,
        prompt: buildGrammarPrompt(input, blueprintResult.value, storyResult.value, sectionVocabulary),
        validate: (value) => [...exerciseIssues(value, 20), ...referenceIssues(value, input)],
      }),
      generateSection<ReadingSection>({
        name: "reading",
        schema: readingSchema,
        prompt: buildReadingPrompt(input, blueprintResult.value, storyResult.value, sectionVocabulary),
        validate: (value) => [
          ...exactArrayIssues(value, "lines", 6),
          ...referenceIssues(value, input),
        ],
      }),
      generateSection<ListeningSection>({
        name: "listening",
        schema: listeningSchema,
        prompt: buildListeningPrompt(input, blueprintResult.value, storyResult.value, sectionVocabulary),
        validate: (value) => [...listeningIssues(value), ...referenceIssues(value, input)],
      }),
      generateSection<SpeakingSection>({
        name: "speaking",
        schema: speakingSchema,
        prompt: buildSpeakingPrompt(input, blueprintResult.value, storyResult.value, sectionVocabulary),
        validate: (value) => [...speakingIssues(value), ...referenceIssues(value, input)],
      }),
      generateSection<InteractiveSection>({
        name: "interactive",
        schema: interactiveSchema,
        prompt: buildInteractivePrompt(input, blueprintResult.value, storyResult.value, sectionVocabulary),
        validate: (value) => [...interactiveIssues(value), ...referenceIssues(value, input)],
      }),
    ]);

  const lookup = inspectableLookup(input);
  const canonical = canonicalizeTerms({
    story: storyResult.value,
    vocabulary: vocabularyResult.value,
    grammar: grammarResult.value,
    reading: readingResult.value,
    listening: listeningResult.value,
    speaking: speakingResult.value,
    interactive: interactiveResult.value,
  }, lookup) as RecordValue;

  const attempts = [
    ...blueprintResult.attempts,
    ...storyResult.attempts,
    ...vocabularyResult.attempts,
    ...grammarResult.attempts,
    ...readingResult.attempts,
    ...listeningResult.attempts,
    ...speakingResult.attempts,
    ...interactiveResult.attempts,
  ];
  const universal: UniversalLessonPackage = {
    schemaVersion: 1,
    blueprint: blueprintResult.value,
    targets: {
      kanji: input.targets.kanji,
      grammar: input.targets.grammar,
    },
    knownKanji: input.targets.knownKanji,
    story: canonical.story as StorySection,
    vocabulary: canonical.vocabulary as ExerciseSection,
    grammar: canonical.grammar as ExerciseSection,
    reading: canonical.reading as ReadingSection,
    listening: canonical.listening as ListeningSection,
    speaking: canonical.speaking as SpeakingSection,
    interactive: canonical.interactive as InteractiveSection,
    renderingPolicy: {
      questionContentInspectable: true,
      answerDataInspectable: false,
      unknownKanjiReadingFormat: "surface（reading）",
    },
    generationAudit: {
      primaryModel: PRIMARY_MODEL,
      fallbackModel: FALLBACK_MODEL,
      attempts,
    },
  };

  return legacyPackage(input, universal);
}
