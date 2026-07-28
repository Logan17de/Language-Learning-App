import type { JsonSchema } from "@/lib/gemini/structured-output";

export interface LibraryEnrichmentMappingRequest {
  level: string;
  topic: string;
  kanji: string[];
  allowedKanji: string[];
  grammar: string[];
  vocabulary: Array<{
    writtenForm: string;
    readingHint: string;
    contextJapanese: string;
    contextEnglish: string;
  }>;
}

export interface RawKanjiEnrichment {
  requestIndex: number;
  meanings: string[];
  readings: string[];
  onyomi: string[];
  kunyomi: string[];
  exampleWords: string[];
  strokeCount: number;
}

export interface RawGrammarEnrichment {
  requestIndex: number;
  meaning: string;
  formation: string;
  usageNotes: string;
  nuance: string;
  exampleSentences: string[];
}

export interface RawVocabularyEnrichment {
  requestIndex: number;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  tags: string[];
  exampleSentence: string;
}

export interface RawLibraryEnrichment {
  kanji: RawKanjiEnrichment[];
  grammar: RawGrammarEnrichment[];
  vocabulary: RawVocabularyEnrichment[];
}

export interface MappedLibrarySeed {
  kanji: Array<Omit<RawKanjiEnrichment, "requestIndex"> & { character: string }>;
  grammar: Array<Omit<RawGrammarEnrichment, "requestIndex"> & { pattern: string }>;
  vocabulary: Array<
    Omit<RawVocabularyEnrichment, "requestIndex" | "reading"> & {
      writtenForm: string;
      reading: string;
      linkedKanjiCharacters: string[];
    }
  >;
}

function stringArray(minItems = 0, maxItems = 100): JsonSchema {
  return {
    type: "array",
    minItems,
    maxItems,
    items: { type: "string" },
  };
}

function indexedObjectArray(
  length: number,
  properties: Record<string, JsonSchema>,
  required: string[],
): JsonSchema {
  return {
    type: "array",
    minItems: length,
    maxItems: length,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["requestIndex", ...required],
      properties: {
        requestIndex: {
          type: "integer",
          minimum: 0,
          ...(length > 0 ? { maximum: length - 1 } : {}),
        },
        ...properties,
      },
    },
  };
}

export function libraryEnrichmentSchema(
  request: LibraryEnrichmentMappingRequest,
): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kanji", "grammar", "vocabulary"],
    properties: {
      kanji: indexedObjectArray(
        request.kanji.length,
        {
          meanings: stringArray(1, 5),
          readings: stringArray(1, 10),
          onyomi: stringArray(0, 8),
          kunyomi: stringArray(0, 8),
          exampleWords: stringArray(2, 6),
          strokeCount: { type: "integer", minimum: 1, maximum: 64 },
        },
        ["meanings", "readings", "onyomi", "kunyomi", "exampleWords", "strokeCount"],
      ),
      grammar: indexedObjectArray(
        request.grammar.length,
        {
          meaning: { type: "string" },
          formation: { type: "string" },
          usageNotes: { type: "string" },
          nuance: { type: "string" },
          exampleSentences: stringArray(2, 5),
        },
        ["meaning", "formation", "usageNotes", "nuance", "exampleSentences"],
      ),
      vocabulary: indexedObjectArray(
        request.vocabulary.length,
        {
          reading: { type: "string" },
          meaning: { type: "string" },
          partOfSpeech: { type: "string" },
          tags: stringArray(1, 6),
          exampleSentence: { type: "string" },
        },
        ["reading", "meaning", "partOfSpeech", "tags", "exampleSentence"],
      ),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value: unknown, minimum = 1): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.every((item) => nonEmptyString(item))
  );
}

function indexIssues(
  value: unknown,
  expectedLength: number,
  label: string,
): string[] {
  if (!Array.isArray(value)) return [`${label} output must be an array.`];

  const received = value.map((item) =>
    isRecord(item) && Number.isInteger(item.requestIndex)
      ? Number(item.requestIndex)
      : null,
  );
  const valid = received.filter((item): item is number => item !== null);
  const expected = Array.from({ length: expectedLength }, (_, index) => index);
  const counts = new Map<number, number>();
  for (const index of valid) counts.set(index, (counts.get(index) ?? 0) + 1);

  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([index]) => index);
  const missing = expected.filter((index) => !counts.has(index));
  const outOfRange = valid.filter((index) => index < 0 || index >= expectedLength);
  const issues: string[] = [];

  if (received.some((index) => index === null)) {
    issues.push(`${label} requestIndex values must all be integers.`);
  }
  if (value.length !== expectedLength) {
    issues.push(
      `${label} expected ${expectedLength} entries but received ${value.length}.`,
    );
  }
  if (duplicates.length > 0) {
    issues.push(`${label} duplicate indexes: ${duplicates.join(", ")}.`);
  }
  if (missing.length > 0) {
    issues.push(`${label} missing indexes: ${missing.join(", ")}.`);
  }
  if (outOfRange.length > 0) {
    issues.push(`${label} out-of-range indexes: ${outOfRange.join(", ")}.`);
  }
  if (issues.length > 0) {
    issues.push(
      `${label} expected indexes [${expected.join(", ")}]; received [${received
        .map((index) => (index === null ? "invalid" : index))
        .join(", ")}].`,
    );
  }
  return issues;
}

export function libraryEnrichmentIssues(
  value: unknown,
  request: LibraryEnrichmentMappingRequest,
): string[] {
  if (!isRecord(value)) return ["Library enrichment output must be an object."];

  const issues = [
    ...indexIssues(value.kanji, request.kanji.length, "Kanji"),
    ...indexIssues(value.grammar, request.grammar.length, "Grammar"),
    ...indexIssues(value.vocabulary, request.vocabulary.length, "Vocabulary"),
  ];

  if (Array.isArray(value.kanji)) {
    value.kanji.forEach((item, position) => {
      if (!isRecord(item)) {
        issues.push(`Kanji entry ${position} must be an object.`);
        return;
      }
      if (!nonEmptyStringArray(item.meanings)) {
        issues.push(`Kanji entry ${position} needs at least one English meaning.`);
      }
      if (!nonEmptyStringArray(item.readings)) {
        issues.push(`Kanji entry ${position} needs at least one reading.`);
      }
      if (!nonEmptyStringArray(item.exampleWords, 2)) {
        issues.push(`Kanji entry ${position} needs at least two example words.`);
      }
      if (
        !Number.isInteger(item.strokeCount) ||
        Number(item.strokeCount) < 1 ||
        Number(item.strokeCount) > 64
      ) {
        issues.push(`Kanji entry ${position} has an invalid stroke count.`);
      }
    });
  }

  if (Array.isArray(value.grammar)) {
    value.grammar.forEach((item, position) => {
      if (!isRecord(item)) {
        issues.push(`Grammar entry ${position} must be an object.`);
        return;
      }
      for (const field of ["meaning", "formation", "usageNotes", "nuance"] as const) {
        if (!nonEmptyString(item[field])) {
          issues.push(`Grammar entry ${position} has an empty ${field}.`);
        }
      }
      if (!nonEmptyStringArray(item.exampleSentences, 2)) {
        issues.push(`Grammar entry ${position} needs at least two examples.`);
      }
    });
  }

  if (Array.isArray(value.vocabulary)) {
    value.vocabulary.forEach((item, position) => {
      if (!isRecord(item)) {
        issues.push(`Vocabulary entry ${position} must be an object.`);
        return;
      }
      for (const field of ["reading", "meaning", "partOfSpeech", "exampleSentence"] as const) {
        if (!nonEmptyString(item[field])) {
          issues.push(`Vocabulary entry ${position} has an empty ${field}.`);
        }
      }
      if (!nonEmptyStringArray(item.tags)) {
        issues.push(`Vocabulary entry ${position} needs at least one tag.`);
      }
    });
  }

  return [...new Set(issues)];
}

export function normalizeJapaneseLookup(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[〜~]/gu, "～")
    .trim();
}

export function linkedKanjiForWord(
  writtenForm: string,
  allowedKanji: string[],
): string[] {
  const allowed = new Set(allowedKanji.map(normalizeJapaneseLookup));
  return [
    ...new Set(
      (writtenForm.match(/\p{Script=Han}/gu) ?? [])
        .map(normalizeJapaneseLookup)
        .filter((character) => allowed.has(character)),
    ),
  ];
}

function byIndex<T extends { requestIndex: number }>(items: T[]): Map<number, T> {
  return new Map(items.map((item) => [item.requestIndex, item]));
}

export function mapLibraryEnrichment(
  value: unknown,
  request: LibraryEnrichmentMappingRequest,
): MappedLibrarySeed {
  const issues = libraryEnrichmentIssues(value, request);
  if (issues.length > 0) {
    throw new Error(`Library enrichment mapping failed: ${issues.join(" ")}`);
  }

  const raw = value as unknown as RawLibraryEnrichment;
  const kanjiByIndex = byIndex(raw.kanji);
  const grammarByIndex = byIndex(raw.grammar);
  const vocabularyByIndex = byIndex(raw.vocabulary);

  return {
    kanji: request.kanji.map((character, requestIndex) => {
      const item = kanjiByIndex.get(requestIndex)!;
      return {
        meanings: item.meanings,
        readings: item.readings,
        onyomi: item.onyomi,
        kunyomi: item.kunyomi,
        exampleWords: item.exampleWords,
        strokeCount: item.strokeCount,
        character,
      };
    }),
    grammar: request.grammar.map((pattern, requestIndex) => {
      const item = grammarByIndex.get(requestIndex)!;
      return {
        meaning: item.meaning,
        formation: item.formation,
        usageNotes: item.usageNotes,
        nuance: item.nuance,
        exampleSentences: item.exampleSentences,
        pattern,
      };
    }),
    vocabulary: request.vocabulary.map((requested, requestIndex) => {
      const item = vocabularyByIndex.get(requestIndex)!;
      return {
        meaning: item.meaning,
        partOfSpeech: item.partOfSpeech,
        tags: item.tags,
        exampleSentence: item.exampleSentence,
        writtenForm: normalizeJapaneseLookup(requested.writtenForm),
        reading: normalizeJapaneseLookup(requested.readingHint),
        linkedKanjiCharacters: linkedKanjiForWord(
          requested.writtenForm,
          request.allowedKanji,
        ),
      };
    }),
  };
}

export function libraryEnrichmentPrompt(
  request: LibraryEnrichmentMappingRequest,
): string {
  const kanji = request.kanji.map((character, requestIndex) => ({
    requestIndex,
    character,
  }));
  const grammar = request.grammar.map((pattern, requestIndex) => ({
    requestIndex,
    pattern,
  }));
  const vocabulary = request.vocabulary.map((item, requestIndex) => ({
    requestIndex,
    writtenForm: item.writtenForm,
    readingHint: item.readingHint,
    contextJapanese: item.contextJapanese,
    contextEnglish: item.contextEnglish,
  }));

  return [
    "Fill only the descriptive metadata for these missing AIko library records.",
    `JLPT ceiling: ${request.level}`,
    `Topic context: ${request.topic}`,
    `Kanji requests: ${JSON.stringify(kanji)}`,
    `Grammar requests: ${JSON.stringify(grammar)}`,
    `Vocabulary requests: ${JSON.stringify(vocabulary)}`,
    `Allowed kanji for server-derived vocabulary links: ${JSON.stringify(request.allowedKanji)}`,
    "For every section, return exactly one result for every requestIndex.",
    "requestIndex must cover 0 through the section length minus 1 exactly once, even if output order changes.",
    "Do not output character, pattern, writtenForm, linkedKanjiCharacters, or any other permanent identifier.",
    "Do not add, remove, duplicate, merge, or substitute requested records.",
    "Use kana readings, concise English meanings, and natural Japanese examples.",
    "The server restores all permanent identifiers and vocabulary links after validation.",
  ].join("\n");
}
