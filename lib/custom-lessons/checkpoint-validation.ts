export type ActivityGroupName =
  | "vocabulary_and_kanji"
  | "grammar_and_reading"
  | "listening_and_speaking";

export interface CheckpointInspection {
  valid: ActivityGroupName[];
  invalid: Array<{ group: ActivityGroupName; issues: string[] }>;
  missing: ActivityGroupName[];
}

export const ACTIVITY_GROUPS: ActivityGroupName[] = [
  "vocabulary_and_kanji",
  "grammar_and_reading",
  "listening_and_speaking",
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizedChoice(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function normalizeGeneratedCheckpoint(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFKC").trim();
  if (Array.isArray(value)) return value.map(normalizeGeneratedCheckpoint);
  const source = record(value);
  if (!source) return value;
  return Object.fromEntries(
    Object.entries(source).map(([key, child]) => [key, normalizeGeneratedCheckpoint(child)]),
  );
}

function requiredTextIssues(
  item: Record<string, unknown>,
  fields: string[],
  label: string,
): string[] {
  return fields.flatMap((field) =>
    text(item[field]) ? [] : [`${label} requires non-empty ${field}.`]
  );
}

/** Structural MCQ validation only. It never judges what the question teaches. */
function multipleChoiceIssues(value: unknown, label: string): string[] {
  const item = record(value);
  if (!item) return [`${label} must be an object.`];
  const issues = requiredTextIssues(
    item,
    ["prompt", "correctAnswer", "explanation"],
    label,
  );
  const choices = array(item.choices).flatMap((choice) =>
    text(choice) ? [text(choice)!] : []
  );
  if (choices.length !== 4) {
    issues.push(`${label} must contain exactly four non-empty choices.`);
  }
  const normalized = choices.map(normalizedChoice);
  if (new Set(normalized).size !== normalized.length) {
    issues.push(`${label} choices must be distinct.`);
  }
  const answer = text(item.correctAnswer);
  if (answer && !normalized.includes(normalizedChoice(answer))) {
    issues.push(`${label} correctAnswer must occur in choices.`);
  }
  return issues;
}

function questionArrayIssues(value: unknown, expected: number, label: string): string[] {
  const questions = array(value);
  const issues = questions.length === expected
    ? []
    : [`${label} must contain exactly ${expected} questions.`];
  questions.forEach((question, index) => {
    issues.push(...multipleChoiceIssues(question, `${label} ${index + 1}`));
  });
  return issues;
}

function readingQuestionArrayIssues(value: unknown): string[] {
  const questions = array(value);
  const issues = questions.length === 5
    ? []
    : ["Reading questions must contain exactly 5 questions."];

  questions.forEach((question, index) => {
    const item = record(question);
    const label = `Reading question ${index + 1}`;
    if (!item) {
      issues.push(`${label} must be an object.`);
      return;
    }
    issues.push(...requiredTextIssues(item, ["question", "answer"], label));
    const choices = array(item.choices).flatMap((choice) =>
      text(choice) ? [text(choice)!] : []
    );
    if (choices.length !== 4) {
      issues.push(`${label} must contain exactly four non-empty choices.`);
    }
    const normalized = choices.map(normalizedChoice);
    if (new Set(normalized).size !== normalized.length) {
      issues.push(`${label} choices must be distinct.`);
    }
    const answer = text(item.answer);
    if (answer && !normalized.includes(normalizedChoice(answer))) {
      issues.push(`${label} answer must occur in choices.`);
    }
  });

  return issues;
}

function teachingArrayIssues(
  value: unknown,
  expected: number,
  label: string,
  fields: string[],
): string[] {
  const items = array(value);
  const issues = items.length === expected
    ? []
    : [`${label} must contain exactly ${expected} entries.`];
  items.forEach((entry, index) => {
    const item = record(entry);
    const itemLabel = `${label} ${index + 1}`;
    if (!item) {
      issues.push(`${itemLabel} must be an object.`);
      return;
    }
    issues.push(...requiredTextIssues(item, ["libraryId", ...fields], itemLabel));
  });
  return issues;
}

export function activityGroupCheckpointIssues(
  group: ActivityGroupName,
  value: unknown,
  _validLibraryIds: ReadonlySet<string>,
): string[] {
  const payload = record(value);
  if (!payload) return [`${group} checkpoint must be an object.`];
  const issues: string[] = [];

  if (group === "vocabulary_and_kanji") {
    issues.push(...teachingArrayIssues(
      payload.kanjiTeaching,
      5,
      "Kanji teaching",
      ["character", "reading", "meaning"],
    ));
    issues.push(...questionArrayIssues(payload.vocabularyQuestions, 7, "Vocabulary question"));
    return issues;
  }

  if (group === "grammar_and_reading") {
    issues.push(...teachingArrayIssues(
      payload.grammarTeaching,
      3,
      "Grammar teaching",
      ["pattern", "meaning", "formation", "usage", "example", "translation"],
    ));
    issues.push(...questionArrayIssues(payload.grammarQuestions, 7, "Grammar question"));

    issues.push(...requiredTextIssues(
      payload,
      ["readingTitle", "readingJapaneseTitle"],
      "Reading region",
    ));
    const lines = array(payload.readingConversation);
    if (lines.length < 1 || lines.length > 6) {
      issues.push("Reading conversation must contain 1 to 6 lines.");
    }
    lines.forEach((line, index) => {
      const item = record(line);
      const label = `Reading line ${index + 1}`;
      if (!item) issues.push(`${label} must be an object.`);
      else issues.push(...requiredTextIssues(item, ["japanese", "english"], label));
    });
    issues.push(...readingQuestionArrayIssues(payload.readingQuestions));
    return issues;
  }

  const listening = array(payload.listeningExercises);
  const speaking = array(payload.speakingExercises);
  if (listening.length !== 5) issues.push("Listening region must contain exactly 5 exercises.");
  if (speaking.length !== 5) issues.push("Speaking region must contain exactly 5 exercises.");

  listening.forEach((exercise, index) => {
    const item = record(exercise);
    const label = `Listening exercise ${index + 1}`;
    if (!item) {
      issues.push(`${label} must be an object.`);
      return;
    }
    issues.push(...multipleChoiceIssues(item, label));
    issues.push(...requiredTextIssues(item, ["transcript"], label));
    const lines = array(item.conversationLines);
    if (lines.length < 1 || lines.some((line) => !text(line))) {
      issues.push(`${label} conversationLines must be populated.`);
    }
  });

  speaking.forEach((exercise, index) => {
    const item = record(exercise);
    const label = `Speaking exercise ${index + 1}`;
    if (!item) {
      issues.push(`${label} must be an object.`);
      return;
    }
    issues.push(...requiredTextIssues(item, ["prompt", "expectedAnswer", "modelAnswer"], label));
    if (item.questionType !== "read_aloud") {
      issues.push(`${label} must be a playable read_aloud activity.`);
    }
    if (array(item.expectedConcepts).length < 1 || array(item.semanticCriteria).length < 1) {
      issues.push(`${label} requires expectedConcepts and semanticCriteria.`);
    }
  });
  return issues;
}

export function inspectPersistedActivityCheckpoints(
  checkpoints: Partial<Record<ActivityGroupName, unknown>>,
  validLibraryIds: ReadonlySet<string>,
): CheckpointInspection {
  const inspection: CheckpointInspection = { valid: [], invalid: [], missing: [] };
  for (const group of ACTIVITY_GROUPS) {
    const checkpoint = checkpoints[group];
    if (checkpoint === null || checkpoint === undefined) {
      inspection.missing.push(group);
      continue;
    }
    const issues = activityGroupCheckpointIssues(group, checkpoint, validLibraryIds);
    if (issues.length > 0) inspection.invalid.push({ group, issues });
    else inspection.valid.push(group);
  }
  return inspection;
}

export function resolvedLibraryCheckpointIssues(
  value: unknown,
  validLibraryIds?: ReadonlySet<string>,
): string[] {
  const library = record(value);
  if (!library) return ["Resolved library checkpoint must be an object."];
  const issues: string[] = [];
  const kanji = array(library.kanji);
  const grammar = array(library.grammar);
  const vocabulary = array(library.vocabulary);

  if (kanji.length < 5) issues.push("Resolved library must contain at least 5 kanji target identities.");
  if (grammar.length !== 3) issues.push("Resolved library must contain exactly 3 grammar target identities.");

  kanji.forEach((entry, index) => {
    const item = record(entry);
    const id = item ? text(item.libraryId) : null;
    if (!item) issues.push(`Kanji ${index + 1} must be an object.`);
    else if (!id || !text(item.character)) issues.push(`Kanji ${index + 1} is missing its target identity.`);
    else if (validLibraryIds && !validLibraryIds.has(id)) issues.push(`Kanji ${index + 1} references invalid library ID ${id}.`);
  });

  grammar.forEach((entry, index) => {
    const item = record(entry);
    const id = item ? text(item.libraryId) : null;
    if (!item) issues.push(`Grammar ${index + 1} must be an object.`);
    else if (!id || !text(item.pattern)) issues.push(`Grammar ${index + 1} is missing its target identity.`);
    else if (validLibraryIds && !validLibraryIds.has(id)) issues.push(`Grammar ${index + 1} references invalid library ID ${id}.`);
  });

  // Story tappability is optional. Validate curated rows only when they exist.
  vocabulary.forEach((entry, index) => {
    const item = record(entry);
    const id = item ? text(item.libraryId) : null;
    if (!item || !id || !text(item.term) || !text(item.reading) || !text(item.meaning)) {
      issues.push(`Tappable vocabulary ${index + 1} is incomplete.`);
    } else if (validLibraryIds && !validLibraryIds.has(id)) {
      issues.push(`Tappable vocabulary ${index + 1} references invalid library ID ${id}.`);
    }
  });
  return issues;
}

export function storyCheckpointIssues(value: unknown): string[] {
  const story = record(value);
  if (!story) return ["Story checkpoint must be an object."];
  const issues = requiredTextIssues(
    story,
    ["title", "japaneseTitle", "summary", "storyPreview"],
    "Story",
  );
  const lines = array(story.lines);
  if (lines.length < 1) issues.push("Story lines must not be empty.");
  lines.forEach((line, index) => {
    const item = record(line);
    if (!item) issues.push(`Story line ${index + 1} must be an object.`);
    else issues.push(...requiredTextIssues(item, ["japanese", "english"], `Story line ${index + 1}`));
  });
  // Story length is asked for in the generation prompt, not enforced here. A
  // sixteen-sentence story is a perfectly good story, and rejecting it threw
  // away a finished generation to buy one fewer sentence. Nothing downstream
  // depends on the count either: the playable package accepts up to 20 lines.
  return issues;
}

export function playableLessonPackageIssues(value: unknown): string[] {
  const lesson = record(value);
  if (!lesson) return ["Playable lesson package must be an object."];
  const issues = requiredTextIssues(lesson, ["title", "japaneseTitle", "summary"], "Lesson");
  if (lesson.schemaVersion !== 2) issues.push("Lesson schemaVersion must be 2.");

  const counts: Array<[string, number, number]> = [
    ["story", 1, 20],
    ["kanji", 5, 5],
    ["vocabulary", 0, 200],
    ["grammar", 3, 3],
    ["vocabularyQuestions", 7, 7],
    ["grammarQuestions", 7, 7],
    ["readingConversation", 1, 6],
    ["readingQuestions", 5, 5],
    ["listeningExercises", 5, 5],
    ["speakingExercises", 5, 5],
    ["reviewQuestions", 0, 0],
  ];
  for (const [key, minimum, maximum] of counts) {
    const length = array(lesson[key]).length;
    if (length < minimum || length > maximum) {
      issues.push(`${key} must contain ${minimum === maximum ? minimum : `${minimum} to ${maximum}`} items.`);
    }
  }

  for (const [index, line] of array(lesson.story).entries()) {
    const item = record(line);
    if (!item || !text(item.japanese) || !text(item.english)) {
      issues.push(`Story line ${index + 1} is not playable.`);
    }
  }
  issues.push(...questionArrayIssues(lesson.vocabularyQuestions, 7, "Vocabulary question"));
  issues.push(...questionArrayIssues(lesson.grammarQuestions, 7, "Grammar question"));
  issues.push(...readingQuestionArrayIssues(lesson.readingQuestions));
  return issues;
}

export function groupForPackageIssue(issue: string): ActivityGroupName | null {
  const normalized = issue.toLocaleLowerCase();
  if (normalized.includes("listening") || normalized.includes("speaking")) return "listening_and_speaking";
  if (normalized.includes("grammar") || normalized.includes("reading")) return "grammar_and_reading";
  if (normalized.includes("kanji") || normalized.includes("vocabulary")) return "vocabulary_and_kanji";
  return null;
}
