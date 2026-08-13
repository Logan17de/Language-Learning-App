import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  matchCuratedStoryVocabulary,
  type CuratedVocabularyMatch,
} from "@/lib/curated-vocabulary-catalog";
import type {
  GenerationAuditEntry,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import type { JLPTLevel } from "@/types/lesson";

export const CURATED_VOCABULARY_SOURCE_MODEL = "jlpt-curated-csv";
const CURATED_VOCABULARY_SOURCE = "JLPT curated CSV" as const;

export interface RawStoryVocabulary {
  word: string;
  dictionaryForm: string;
  reading: string;
  meaning: string;
  partOfSpeech: "other";
  conjugationType: null;
  aliases: string[];
  source: typeof CURATED_VOCABULARY_SOURCE;
  studyLevel: JLPTLevel;
  sourceEntry: string;
  sourceFile: string;
}

function storyJapanese(draft: StoryDraft): string {
  return draft.lines.map((line) => line.japanese).join("\n").normalize("NFKC");
}

function asStoryVocabulary(match: CuratedVocabularyMatch): RawStoryVocabulary {
  return {
    word: match.word,
    dictionaryForm: match.word,
    reading: match.reading,
    meaning: match.meaning,
    partOfSpeech: "other",
    conjugationType: null,
    aliases: [],
    source: CURATED_VOCABULARY_SOURCE,
    studyLevel: match.studyLevel,
    sourceEntry: match.id,
    sourceFile: match.sourceFile,
  };
}

/**
 * Story tappability now comes only from the manually curated JLPT compound
 * catalogs committed under Vocabs/. No external dictionary or local JMdict
 * cache participates in lesson generation.
 */
export function lookupCuratedStoryVocabulary(draft: StoryDraft): RawStoryVocabulary[] {
  return matchCuratedStoryVocabulary(storyJapanese(draft)).map(asStoryVocabulary);
}

export async function enrichGeneratedStoryVocabulary(input: {
  requestId: string;
  level: JLPTLevel;
  draft: StoryDraft;
  admin?: SupabaseClient;
}): Promise<{ vocabulary: RawStoryVocabulary[]; audit: GenerationAuditEntry }> {
  const vocabulary = lookupCuratedStoryVocabulary(input.draft);

  // Tappable vocabulary is optional. A story should never be regenerated merely
  // because the curated catalog has only a few (or zero) exact matches.
  if (vocabulary.length > 0) {
    const admin = input.admin ?? createAdminClient();
    const { error } = await admin.rpc("store_story_vocabulary_enrichment", {
      p_request_id: input.requestId,
      p_level: input.level,
      p_vocabulary: vocabulary,
      p_source_model: CURATED_VOCABULARY_SOURCE_MODEL,
    } as never);
    if (error) {
      throw new Error(`Curated story vocabulary could not be stored: ${error.message}`);
    }
  }

  return {
    vocabulary,
    audit: {
      stage: "library",
      model: CURATED_VOCABULARY_SOURCE_MODEL,
      repaired: false,
    },
  };
}
