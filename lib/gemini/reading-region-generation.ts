import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/gemini/structured-output";
import {
  readingPassagePrompt,
  readingPassageSchema,
  readingQuestionsPrompt,
  readingQuestionsSchema,
  type RawReadingPassage,
  type RawReadingQuestion,
  type RawReadingQuestions,
} from "@/lib/gemini/reading-comprehension-contract";
import {
  simpleStoryEnrichmentSchema,
  storyEnrichmentPrompt,
  type RawStoryVocabulary,
  type SimpleStoryEnrichment,
} from "@/lib/gemini/simple-story-enrichment-contract";
import type {
  GenerationAuditEntry,
  InspectableTerm,
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

export interface GeneratedReadingLine {
  speaker: string;
  japanese: string;
  english: string;
  targetItemIds: string[];
  inspectableTerms: InspectableTerm[];
}

export interface GeneratedReadingRegion {
  title: string;
  japaneseTitle: string;
  lines: GeneratedReadingLine[];
  questions: RawReadingQuestion[];
  audit: GenerationAuditEntry;
}

interface StoredVocabularyRow {
  vocabulary_id: string;
  word: string;
  reading: string;
  meaning: string;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim();
}

function readingQuestionIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Reading response must be an object."];
  }
  const questions = (value as Record<string, unknown>).questions;
  if (!Array.isArray(questions)) return ["Reading response must contain questions."];
  const issues: string[] = [];
  if (questions.length < 3 || questions.length > 10) {
    issues.push("Reading response needs between 3 and 10 questions.");
  }
  const counts = { easy: 0, medium: 0, hard: 0 };
  const seen = new Set<string>();
  questions.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      issues.push(`Reading question ${index + 1} must be an object.`);
      return;
    }
    const item = candidate as Record<string, unknown>;
    if (item.difficulty === "easy" || item.difficulty === "medium" || item.difficulty === "hard") {
      counts[item.difficulty] += 1;
    }
    if (typeof item.question !== "string" || !item.question.trim()) {
      issues.push(`Reading question ${index + 1} needs Japanese question text.`);
    } else {
      const key = normalized(item.question);
      if (seen.has(key)) issues.push(`Reading question ${index + 1} repeats another question.`);
      seen.add(key);
      if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(item.question)) {
        issues.push(`Reading question ${index + 1} must be written in Japanese.`);
      }
    }
    if (
      typeof item.answer !== "string" ||
      !item.answer.trim() ||
      !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(item.answer)
    ) {
      issues.push(`Reading question ${index + 1} needs a short Japanese answer.`);
    }
  });
  if (counts.easy < 1 || counts.medium < 1 || counts.hard < 1) {
    issues.push("Reading response needs at least one easy, medium, and hard question.");
  }
  return [...new Set(issues)];
}

function scriptType(word: string): InspectableTerm["scriptType"] {
  if (/\p{Script=Han}/u.test(word)) return "kanji";
  if (/\p{Script=Katakana}/u.test(word)) return "katakana";
  return "hiragana";
}

function vocabularyKey(word: string, reading: string, meaning: string): string {
  return [word, reading, meaning].map(normalized).join("\u0000");
}

async function storedInspectableTerms(input: {
  admin?: SupabaseClient;
  requestId?: string;
  level: JLPTLevel;
  vocabulary: RawStoryVocabulary[];
  model: string;
  library: ResolvedLessonLibrary;
}): Promise<InspectableTerm[]> {
  let storedRows: StoredVocabularyRow[] = [];
  if (input.admin && input.requestId) {
    const stored = await input.admin.rpc("store_story_vocabulary_enrichment", {
      p_request_id: input.requestId,
      p_level: input.level,
      p_vocabulary: input.vocabulary as unknown as Json,
      p_source_model: input.model,
    });
    if (stored.error) {
      throw new Error(`Reading vocabulary could not be stored: ${stored.error.message}`);
    }
    const rows = await input.admin
      .from("story_vocabulary_enrichments")
      .select("vocabulary_id,word,reading,meaning")
      .eq("request_id", input.requestId);
    if (rows.error) {
      throw new Error(`Reading vocabulary could not be loaded: ${rows.error.message}`);
    }
    storedRows = (rows.data ?? []) as StoredVocabularyRow[];
  }

  const storedByKey = new Map(
    storedRows.map((row) => [
      vocabularyKey(row.word, row.reading, row.meaning),
      row.vocabulary_id,
    ]),
  );
  return input.vocabulary.flatMap((item) => {
    const storedId = storedByKey.get(vocabularyKey(item.word, item.reading, item.meaning));
    const existing = input.library.vocabulary.find((candidate) =>
      normalized(candidate.term) === normalized(item.word) &&
      normalized(candidate.reading) === normalized(item.reading),
    );
    const libraryId = storedId ?? existing?.libraryId;
    if (!libraryId) return [];
    return [{
      libraryId,
      libraryType: "vocabulary" as const,
      surface: item.word,
      reading: item.reading,
      meaning: item.meaning,
      scriptType: scriptType(item.word),
    }];
  });
}

function sentences(value: string, japanese: boolean): string[] {
  const matcher = japanese
    ? /[^。！？!?]+[。！？!?]?/gu
    : /[^.!?]+[.!?]?/gu;
  return (value.match(matcher) ?? [value])
    .map((item) => item.trim())
    .filter(Boolean);
}

function partitions(items: string[], count: number, separator = ""): string[] {
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * items.length) / count);
    const end = Math.floor(((index + 1) * items.length) / count);
    return items.slice(start, end).join(separator);
  });
}

function readingLines(
  passage: RawReadingPassage,
  terms: InspectableTerm[],
): GeneratedReadingLine[] {
  const japaneseSentences = sentences(passage.japanese_story, true);
  const englishSentences = sentences(passage.english_translation, false);
  const count = Math.min(6, Math.max(4, japaneseSentences.length));
  const japaneseParts = partitions(japaneseSentences, count);
  const englishParts = partitions(englishSentences, count, " ");
  return japaneseParts.map((japanese, index) => {
    const lineTerms = terms.filter((term) => japanese.includes(term.surface));
    return {
      speaker: "Reading",
      japanese,
      english: englishParts[index] ?? "",
      targetItemIds: [...new Set(lineTerms.map((term) => term.libraryId))].slice(0, 5),
      inspectableTerms: lineTerms,
    };
  });
}

export async function generateReadingRegion(input: {
  requestId?: string;
  admin?: SupabaseClient;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<GeneratedReadingRegion> {
  const context = input.library.generationContext;
  const passage = await generateStructured<RawReadingPassage>({
    name: "reading_lesson",
    prompt: readingPassagePrompt({
      languageLevel: `JLPT ${input.level}`,
      topic: input.topic,
      naturalInterests: context?.interests ?? input.draft.tags,
      targetGrammar: context?.targetGrammar ?? input.library.grammar.map((item) => item.pattern),
      targetKanji: context?.targetKanji ?? input.library.kanji.slice(0, 5).map((item) => item.character),
    }),
    schema: readingPassageSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: () => [],
    trace: { requestId: input.requestId, stage: "reading_passage" },
  });

  const enrichment = await generateStructured<SimpleStoryEnrichment>({
    name: "reading_vocabulary",
    prompt: storyEnrichmentPrompt(passage.value.japanese_story),
    schema: simpleStoryEnrichmentSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: () => [],
    trace: { requestId: input.requestId, stage: "reading_enrichment" },
  });
  const terms = await storedInspectableTerms({
    admin: input.admin,
    requestId: input.requestId,
    level: input.level,
    vocabulary: enrichment.value.vocabulary,
    model: enrichment.model,
    library: input.library,
  });

  const questions = await generateStructured<RawReadingQuestions>({
    name: "reading_questions",
    prompt: readingQuestionsPrompt({
      languageLevel: `JLPT ${input.level}`,
      japaneseStory: passage.value.japanese_story,
    }),
    schema: readingQuestionsSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: readingQuestionIssues,
    trace: { requestId: input.requestId, stage: "reading_questions" },
  });

  return {
    title: passage.value.english_title,
    japaneseTitle: passage.value.japanese_title,
    lines: readingLines(passage.value, terms),
    questions: questions.value.questions,
    audit: {
      stage: "grammar_reading_activities",
      model: [...new Set([passage.model, enrichment.model, questions.model])].join(", "),
      repaired: passage.repaired || enrichment.repaired || questions.repaired,
    },
  };
}
