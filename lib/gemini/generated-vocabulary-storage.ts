import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InspectableTerm,
  ResolvedLessonLibrary,
} from "@/lib/gemini/lesson-engine-v2";
import type { RawStoryVocabulary } from "@/lib/gemini/simple-story-enrichment-contract";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

interface StoredVocabularyRow {
  vocabulary_id: string;
  word: string;
  reading: string;
  meaning: string;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim();
}

function scriptType(word: string): InspectableTerm["scriptType"] {
  if (/\p{Script=Han}/u.test(word)) return "kanji";
  if (/\p{Script=Katakana}/u.test(word)) return "katakana";
  return "hiragana";
}

function vocabularyKey(word: string, reading: string, meaning: string): string {
  return [word, reading, meaning].map(normalized).join("\u0000");
}

/**
 * Store exact word/reading/meaning enrichment output and return the canonical
 * vocabulary IDs needed by every inspectable lesson region.
 */
export async function storeGeneratedVocabularyTerms(input: {
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
      throw new Error(`Generated vocabulary could not be stored: ${stored.error.message}`);
    }
    const rows = await input.admin
      .from("story_vocabulary_enrichments")
      .select("vocabulary_id,word,reading,meaning")
      .eq("request_id", input.requestId);
    if (rows.error) {
      throw new Error(`Generated vocabulary could not be loaded: ${rows.error.message}`);
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
