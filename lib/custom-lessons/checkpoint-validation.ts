export type ActivityGroupName =
  | "vocabulary_and_kanji"
  | "grammar_and_reading"
  | "listening_and_speaking";

export interface CheckpointInspection {
  valid: ActivityGroupName[];
  invalid: Array<{ group: ActivityGroupName; issues: string[] }>;
  missing: ActivityGroupName[];
}

/** Final review is intentionally not a generation checkpoint anymore. */
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

function targetIssues(
  item: Record<string, unknown>,
  label: string,
  validLibraryIds: ReadonlySet<string>,
): string[] {
  const ids = array(item.targetItemIds).flatMap((id) =>
    text(id) ? [text(id)!] : []
  );
  return ids.flatMap((id) =>
    validLibraryIds.has(id) ? [] : [`${label} references invalid library ID ${id}.`]
  );
}

function multipleChoiceIssues(
  value: unknown,
  label: string,
  validLibraryIds: ReadonlySet<string>,
): string[] {
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
  issues.push(...targetIssues(item, label, validLibraryIds));
  return issues;
}

function questionArrayIssues(
  value: unknown,
  expected: number,
  label: string,
  validLibraryIds: ReadonlySet<string>,
): string[] {
  const questions = array(value);
  const issues = questions.length === expected
    ? []
    : [`${label} must contain exactly ${expected} questions.`];
  questions.forEach((question, index) => {
    issues.push(...multipleChoiceIssues(
      question,
      `${label} ${index + 1}`,
      validLibraryIds,
    ));
  });
  return issues;
}

function difficultyDistributionIssues(
  value: unknown,
  field: string,
  expected: Record<string, number>,
  label: string,
  description: string,
): string[] {
  const items = array(value);
  const counts = new Map<string, number>();
  for (const item of items) {
    const raw = record(item)?.[field];
    if (typeof raw === "string") {
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  const matches = Object.entries(expected).every(
    ([key, count]) => (counts.get(key) ?? 0) === count,
  );
  return matches ? [] : [`${label} must contain ${description}.`];
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

  issues.push(...difficultyDistributionIssues(
    questions,
    "difficulty",
    { easy: 2, medium: 2, hard: 1 },
    "Reading questions",
    "2 easy, 2 medium, and 1 hard question",
  ));
  return issues;
}

function teachingArrayIssues(
  value: unknown,
  expected: number,
  label: string,
  fields: string[],
  validLibraryIds: ReadonlySet<string>,
): string[] {
  const items = array(value);
  const issues = items.length === expected
    ? []
    : [`${label} must contain exactly ${expected} entries.`];
  const ids = new Set<string>();

  items.forEach((entry, index) => {
    const item = record(entry);
    const itemLabel = `${label} ${index + 1}`;
    if (!item) {
      issues.push(`${itemLabel} must be an object.`);
      return;
    }
    issues.push(...requiredTextIssues(item, ["libraryId", ...fields], itemLabel));
    const id = text(item.libraryId);
    if (id) {
      if (!validLibraryIds.has(id)) {
        issues.push(`${itemLabel} references invalid library ID ${id}.`);
      }
      if (ids.has(id)) issues.push(`${itemLabel} repeats library ID ${id}.`);
      ids.add(id);
    }
  });
  return issues;
}

export function activityGroupCheckpointIssues(
  group: ActivityGroupName,
  value: unknown,
  validLibraryIds: ReadonlySet<string>,
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
      validLibraryIds,
    ));
    issues.push(...questionArrayIssues(
      payload.vocabularyQuestions,
      7,
      "Vocabulary question",
      validLibraryIds,
    ));
    issues.push(...difficultyDistributionIssues(
      payload.vocabularyQuestions,
      "difficulty",
      { Easy: 3, Medium: 2, Hard: 2 },
      "Vocabulary questions",
      "3 Easy, 2 Medium, and 2 Hard questions",
    ));
    return issues;
  }

  if (group === "grammar_and_reading") {
    issues.push(...teachingArrayIssues(
      payload.grammarTeaching,
      3,
      "Grammar teaching",
      ["pattern", "meaning", "formation", "usage", "example", "translation"],
      validLibraryIds,
    ));
    issues.push(...questionArrayIssues(
      payload.grammarQuestions,
      7,
      "Grammar question",
      validLibraryIds,
    ));
    issues.push(...difficultyDistributionIssues(
      payload.grammarQuestions,
      "difficulty",
      { Easy: 3, Medium: 2, Hard: 2 },
      "Grammar questions",
      "3 Easy, 2 Medium, and 2 Hard questions",
    ));

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
      if (!item) {
        issues.push(`${label} must be an object.`);
        return;
      }
      issues.push(...requiredTextIssues(item, ["japanese", "english"], label));
      issues.push(...targetIssues(item, label, validLibraryIds));
    });
    issues.push(...readingQuestionArrayIssues(payload.readingQuestions));
    return issues;
  }

  const listening = array(payload.listeningExercises);
  const speaking = array(payload.speakingExercises);
  if (listening.length !== 5) {
    issues.push("Listening region must contain exactly 5 exercises.");
  }
  if (speaking.length !== 5) {
    issues.push("Speaking region must contain exactly 5 exercises.");
  }
  issues.push(...difficultyDistributionIssues(
    listening,
    "difficulty",
    { Easy: 2, Medium: 2, Hard: 1 },
    "Listening exercises",
    "2 Easy, 2 Medium, and 1 Hard exercise",
  ));
  issues.push(...difficultyDistributionIssues(
    speaking,
    "mode",
    { easy: 2, medium: 2, hard: 1 },
    "Speaking exercises",
    "2 easy, 2 medium, and 1 hard exercise",
  ));

  listening.forEach((exercise, index) => {
    const item = record(exercise);
    const label = `Listening exercise ${index + 1}`;
    if (!item) {
      issues.push(`${label} must be an object.`);
      return;
    }
    issues.push(...multipleChoiceIssues(item, label, validLibraryIds));
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
    issues.push(...requiredTextIssues(
      item,
      ["prompt", "expectedAnswer", "modelAnswer"],
      label,
    ));
    if (item.questionType !== "read_aloud") {
      issues.push(`${label} must be a playable read_aloud activity.`);
    }
    if (array(item.expectedConcepts).length < 1 || array(item.semanticCriteria).length < 1) {
      issues.push(`${label} requires expectedConcepts and semanticCriteria.`);
    }
    issues.push(...targetIssues(item, label, validLibraryIds));
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

  if (kanji.length < 5) {
    issues.push("Resolved library must contain at least 5 kanji target identities.");
  }
  if (grammar.length !== 3) {
    issues.push("Resolved library must contain exactly 3 grammar target identities.");
  }
  if (vocabulary.length < 8) {
    issues.push("Resolved story must contain at least 8 tappable vocabulary records.");
  }

  kanji.forEach((entry, index) => {
    const item = record(entry);
    const id = item ? text(item.libraryId) : null;
    if (!item) issues.push(`Kanji ${index + 1} must be an object.`);
    else if (!id || !text(item.character)) {
      issues.push(`Kanji ${index + 1} is missing its target identity.`);
    } else if (validLibraryIds && !validLibraryIds.has(id)) {
      issues.push(`Kanji ${index + 1} references invalid library ID ${id}.`);
    }
  });

  grammar.forEach((entry, index) => {
    const item = record(entry);
    const id = item ? text(item.libraryId) : null;
    if (!item) issues.push(`Grammar ${index + 1} must be an object.`);
    else if (!id || !text(item.pattern)) {
      issues.push(`Grammar ${index + 1} is missing its target identity.`);
    } else if (validLibraryIds && !validLibraryIds.has(id)) {
      issues.push(`Grammar ${index + 1} references invalid library ID ${id}.`);
    }
  });

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
    else issues.push(...requiredTextIssues(
      item,
      ["japanese", "english"],
      `Story line ${index + 1}`,
    ));
  });
  const japanese = lines.flatMap((line) => {
    const item = record(line);
    return text(item?.japanese) ? [text(item?.japanese)!] : [];
  }).join("");
  const sentenceCount = (japanese.match(/[^。！？!?]+[。！？!?]?/gu) ?? [])
    .map((item) => item.trim())
    .filter(Boolean).length;
  if (sentenceCount < 10 || sentenceCount > 15) {
    issues.push(`Story must contain 10 to 15 Japanese sentences; received ${sentenceCount}.`);
  }
  return issues;
}

export function playableLessonPackageIssues(value: unknown): string[] {
  const lesson = record(value);
  if (!lesson) return ["Playable lesson package must be an object."];
  const issues = requiredTextIssues(
    lesson,
    ["title", "japaneseTitle", "summary"],
    "Lesson",
  );
  if (lesson.schemaVersion !== 2) issues.push("Lesson schemaVersion must be 2.");

  const counts: Array<[string, number, number]> = [
    ["story", 1, 20],
    ["kanji", 5, 5],
    ["vocabulary", 8, 200],
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
  issues.push(...readingQuestionArrayIssues(lesson.readingQuestions));
  return issues;
}

export function groupForPackageIssue(issue: string): ActivityGroupName | null {
  const normalized = issue.toLocaleLowerCase();
  if (normalized.includes("listening") || normalized.includes("speaking")) {
    return "listening_and_speaking";
  }
  if (normalized.includes("grammar") || normalized.includes("reading")) {
    return "grammar_and_reading";
  }
  if (normalized.includes("kanji") || normalized.includes("vocabulary")) {
    return "vocabulary_and_kanji";
  }
  return null;
}
