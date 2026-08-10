import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  incompleteGrammarTeachingRecord,
  incompleteKanjiTeachingRecord,
} from "@/lib/custom-lessons/reliability";
import { generateStructured } from "@/lib/gemini/structured-output";
import {
  libraryEnrichmentIssues,
  libraryEnrichmentPrompt,
  libraryEnrichmentSchema,
  mapLibraryEnrichment,
  type LibraryEnrichmentMappingRequest,
  type RawLibraryEnrichment,
} from "@/lib/gemini/library-enrichment-mapping";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
import type { LessonPlanV3 } from "@/lib/gemini/story-pipeline-v3";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

interface KanjiRow {
  character: string;
  meanings: string[];
  readings: string[];
  example_words: string[];
}

interface GrammarRow {
  pattern: string;
  jlpt_level: JLPTLevel;
  meaning: string;
  formation: string;
  usage_notes: string;
  example_sentences: string[];
}

async function teachingRows(
  admin: SupabaseClient,
  plan: LessonPlanV3,
): Promise<{ kanji: KanjiRow[]; grammar: GrammarRow[] }> {
  const [kanji, grammar] = await Promise.all([
    admin
      .from("kanji_records")
      .select("character,meanings,readings,example_words")
      .in("character", plan.kanji.map((item) => item.character))
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
    admin
      .from("grammar_records")
      .select("pattern,jlpt_level,meaning,formation,usage_notes,example_sentences")
      .in("pattern", plan.grammar.map((item) => item.pattern))
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
  ]);
  const error = kanji.error ?? grammar.error;
  if (error) throw new Error(`Selected teaching records could not be loaded: ${error.message}`);
  return {
    kanji: (kanji.data ?? []) as KanjiRow[],
    grammar: (grammar.data ?? []) as GrammarRow[],
  };
}

function missingRecords(
  rows: { kanji: KanjiRow[]; grammar: GrammarRow[] },
  plan: LessonPlanV3,
): { kanji: string[]; grammar: string[] } {
  return {
    kanji: plan.kanji.flatMap(({ character }) => {
      const row = rows.kanji.find((item) => item.character === character);
      return !row || incompleteKanjiTeachingRecord(row) ? [character] : [];
    }),
    grammar: plan.grammar.flatMap(({ pattern, level }) => {
      const row = rows.grammar.find((item) => item.pattern === pattern && item.jlpt_level === level);
      return !row || incompleteGrammarTeachingRecord(row) ? [pattern] : [];
    }),
  };
}

export async function ensureLessonPlanTeachingRecords(input: {
  admin: SupabaseClient;
  requestId: string;
  topic: string;
  level: JLPTLevel;
  plan: LessonPlanV3;
}): Promise<GenerationAuditEntry> {
  const before = await teachingRows(input.admin, input.plan);
  const missing = missingRecords(before, input.plan);
  if (missing.kanji.length < 1 && missing.grammar.length < 1) {
    return { stage: "library", model: "validated-existing-library", repaired: false };
  }

  const request: LibraryEnrichmentMappingRequest = {
    level: input.level,
    topic: input.topic,
    kanji: missing.kanji,
    allowedKanji: input.plan.kanji.map((item) => item.character),
    grammar: missing.grammar,
    vocabulary: [],
  };
  const generated = await generateStructured<RawLibraryEnrichment>({
    name: "selected_catalog_enrichment",
    prompt: libraryEnrichmentPrompt(request),
    schema: libraryEnrichmentSchema(request),
    strictSchema: true,
    exactSchemaName: true,
    validate: (value) => libraryEnrichmentIssues(value, request),
    trace: {
      requestId: input.requestId,
      stage: "library_resolution",
      group: "catalog_placeholders",
    },
  });
  const seed = mapLibraryEnrichment(generated.value, request);
  const saved = await input.admin.rpc("enrich_custom_lesson_placeholders_background", {
    p_request_id: input.requestId,
    p_kanji: seed.kanji as unknown as Json,
    p_grammar: seed.grammar as unknown as Json,
    p_source_model: generated.model,
  });
  if (saved.error) {
    const error = new Error(`Selected teaching records could not be enriched: ${saved.error.message}`) as Error & { code?: string };
    error.code = saved.error.code;
    throw error;
  }

  const after = missingRecords(await teachingRows(input.admin, input.plan), input.plan);
  if (after.kanji.length > 0 || after.grammar.length > 0) {
    throw new Error(
      `Selected catalog enrichment validation failed: ${[
        ...after.kanji.map((item) => `kanji ${item}`),
        ...after.grammar.map((item) => `grammar ${item}`),
      ].join(", ")}.`,
    );
  }
  return { stage: "library", model: generated.model, repaired: generated.repaired };
}
