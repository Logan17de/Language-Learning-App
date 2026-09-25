import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { InspectableTerm } from "@/lib/gemini/lesson-engine-v2";

type VocabularyRow = Database["public"]["Tables"]["vocabulary_records"]["Row"];
type AdminClient = SupabaseClient<Database>;

/**
 * Make the words in Reading and Listening tappable, once those sections exist.
 *
 * Only the story ever had its terms resolved. Reading and Listening were stored
 * with an empty list, so a learner could touch a word in the story and get its
 * reading and meaning, then meet the same word in a listening question and find
 * it dead. This runs in the audio stage, at the point where the lesson's
 * Japanese is final and nothing downstream is waiting on it.
 *
 * The curated vocabulary library is the only source, matching how the story
 * resolves its own terms: no dictionary and no model enrichment.
 */

const CURATED_SOURCE_MODEL = "jlpt-curated-csv";
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const MAX_SURFACE_LENGTH = 32;
const MAX_PIECES_PER_TERM = 6;

interface SegmentPart {
  segment: string;
  isWordLike?: boolean;
}

function segmenter(): { segment(value: string): Iterable<SegmentPart> } {
  const Constructor = (Intl as unknown as {
    Segmenter?: new (
      locale: string,
      options: { granularity: "word" },
    ) => { segment(value: string): Iterable<SegmentPart> };
  }).Segmenter;
  if (!Constructor) throw new Error("The Japanese word segmenter is unavailable.");
  return new Constructor("ja", { granularity: "word" });
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim();
}

function chunk<T>(items: T[], size = 80): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

/** Every run of words the library might know, so one query can fetch them all. */
function candidateSurfaces(texts: string[]): string[] {
  const values = new Set<string>();
  const japanese = segmenter();
  for (const text of texts) {
    const pieces = [...japanese.segment(text)]
      .filter((part) => part.isWordLike && JAPANESE.test(part.segment))
      .map((part) => part.segment);
    for (let start = 0; start < pieces.length; start += 1) {
      let combined = "";
      for (let end = start; end < Math.min(pieces.length, start + MAX_PIECES_PER_TERM); end += 1) {
        combined += pieces[end]!;
        const normalized = normalize(combined);
        if (normalized && normalized.length <= MAX_SURFACE_LENGTH) values.add(normalized);
      }
      // A kanji inside a word is worth knowing on its own: the segmenter keeps
      // it attached to its okurigana, so 考える never offers up 考.
      for (const character of pieces[start]!.match(/\p{Script=Han}/gu) ?? []) {
        values.add(character);
      }
    }
  }
  return [...values];
}

function vocabularyIndex(rows: VocabularyRow[]): Map<string, VocabularyRow[]> {
  const index = new Map<string, VocabularyRow[]>();
  const add = (key: string | null, row: VocabularyRow) => {
    const normalized = key ? normalize(key) : "";
    if (!normalized) return;
    const current = index.get(normalized) ?? [];
    if (!current.some((item) => item.id === row.id)) current.push(row);
    index.set(normalized, current);
  };
  for (const row of rows) {
    add(row.written_form, row);
    add(row.dictionary_form, row);
    for (const alias of row.aliases ?? []) add(alias, row);
  }
  return index;
}

/** Only an unambiguous match is offered, so a tap never teaches the wrong word. */
function uniqueMatch(
  index: Map<string, VocabularyRow[]>,
  surface: string,
): VocabularyRow | null {
  const matches = index.get(normalize(surface));
  return matches && matches.length === 1 ? matches[0]! : null;
}

function scriptType(surface: string): InspectableTerm["scriptType"] {
  if (/\p{Script=Han}/u.test(surface)) return "kanji";
  if (/\p{Script=Katakana}/u.test(surface)) return "katakana";
  return "hiragana";
}

function asTerm(row: VocabularyRow, surface: string): InspectableTerm {
  return {
    libraryId: row.id,
    libraryType: "vocabulary",
    surface,
    reading: row.reading ?? "",
    meaning: row.meaning ?? "",
    scriptType: scriptType(surface),
  };
}

/**
 * The terms present in one piece of text, longest run first so a compound wins
 * over the characters inside it, and each surface offered once.
 */
export function resolveTermsInText(
  text: string,
  index: Map<string, VocabularyRow[]>,
): InspectableTerm[] {
  const japanese = segmenter();
  const pieces = [...japanese.segment(text)]
    .filter((part) => part.isWordLike && JAPANESE.test(part.segment))
    .map((part) => part.segment);

  const terms: InspectableTerm[] = [];
  const seen = new Set<string>();
  const take = (surface: string, row: VocabularyRow) => {
    if (seen.has(surface)) return;
    seen.add(surface);
    terms.push(asTerm(row, surface));
  };

  let cursor = 0;
  while (cursor < pieces.length) {
    let matched = false;
    for (let end = Math.min(pieces.length, cursor + MAX_PIECES_PER_TERM); end > cursor; end -= 1) {
      const surface = pieces.slice(cursor, end).join("");
      const row = uniqueMatch(index, surface);
      if (!row) continue;
      take(surface, row);
      cursor = end;
      matched = true;
      break;
    }
    if (matched) continue;

    // Nothing matched the whole piece, so look inside it, longest span first.
    // This is what makes a single kanji reachable inside 考える or 近く.
    const piece = pieces[cursor]!;
    let offset = 0;
    while (offset < piece.length) {
      let inner: { surface: string; row: VocabularyRow } | null = null;
      for (let size = piece.length - offset; size > 0; size -= 1) {
        const surface = piece.slice(offset, offset + size);
        const row = uniqueMatch(index, surface);
        if (row) {
          inner = { surface, row };
          break;
        }
      }
      if (!inner) {
        offset += 1;
        continue;
      }
      take(inner.surface, inner.row);
      offset += inner.surface.length;
    }
    cursor += 1;
  }

  return terms;
}

async function loadCuratedVocabulary(
  admin: AdminClient,
  surfaces: string[],
): Promise<VocabularyRow[]> {
  if (!surfaces.length) return [];
  const byId = new Map<string, VocabularyRow>();
  for (const group of chunk(surfaces)) {
    const queries = ["written_form", "dictionary_form"].map((column) =>
      admin
        .from("vocabulary_records")
        .select("*")
        .in(column, group)
        .eq("source_model", CURATED_SOURCE_MODEL)
        .is("archived_at", null)
        .neq("quality_status", "rejected"),
    );
    queries.push(
      admin
        .from("vocabulary_records")
        .select("*")
        .overlaps("aliases", group)
        .eq("source_model", CURATED_SOURCE_MODEL)
        .is("archived_at", null)
        .neq("quality_status", "rejected"),
    );
    for (const result of await Promise.all(queries)) {
      if (result.error) throw new Error(result.error.message);
      for (const row of result.data ?? []) byId.set(row.id, row as VocabularyRow);
    }
  }
  return [...byId.values()];
}

export interface TermMappingResult {
  listeningUpdated: number;
  readingUpdated: number;
}

/**
 * Resolve and store the tappable terms for a lesson's Reading and Listening.
 *
 * Rows that already carry terms are left alone, so re-running is safe and an
 * imported lesson keeps whatever it came with.
 */
export async function mapStoredLessonTerms(
  lessonVersionId: string,
  admin: AdminClient,
): Promise<TermMappingResult> {
  const [listening, reading] = await Promise.all([
    admin
      .from("lesson_listening_activities")
      .select("id,prompt,transcript,choices,inspectable_terms")
      .eq("lesson_version_id", lessonVersionId),
    admin
      .from("lesson_reading_sections")
      .select("id,japanese_text,inspectable_terms")
      .eq("lesson_version_id", lessonVersionId),
  ]);
  if (listening.error) throw new Error(listening.error.message);
  if (reading.error) throw new Error(reading.error.message);

  const empty = (value: unknown) => !Array.isArray(value) || value.length === 0;
  const listeningRows = (listening.data ?? []).filter((row) =>
    empty(row.inspectable_terms),
  );
  const readingRows = (reading.data ?? []).filter((row) =>
    empty(row.inspectable_terms),
  );
  if (!listeningRows.length && !readingRows.length) {
    return { listeningUpdated: 0, readingUpdated: 0 };
  }

  const listeningText = (row: (typeof listeningRows)[number]) =>
    [row.prompt ?? "", row.transcript ?? "", ...(row.choices ?? [])]
      .filter(Boolean)
      .join("\n");

  const texts = [
    ...listeningRows.map(listeningText),
    ...readingRows.map((row) => row.japanese_text ?? ""),
  ].filter((text) => JAPANESE.test(text));
  if (!texts.length) return { listeningUpdated: 0, readingUpdated: 0 };

  const index = vocabularyIndex(
    await loadCuratedVocabulary(admin, candidateSurfaces(texts)),
  );

  let listeningUpdated = 0;
  for (const row of listeningRows) {
    const terms = resolveTermsInText(listeningText(row), index);
    if (!terms.length) continue;
    const saved = await admin
      .from("lesson_listening_activities")
      .update({ inspectable_terms: terms as unknown as Json })
      .eq("id", row.id);
    if (saved.error) throw new Error(saved.error.message);
    listeningUpdated += 1;
  }

  let readingUpdated = 0;
  for (const row of readingRows) {
    const terms = resolveTermsInText(row.japanese_text ?? "", index);
    if (!terms.length) continue;
    const saved = await admin
      .from("lesson_reading_sections")
      .update({ inspectable_terms: terms as unknown as Json })
      .eq("id", row.id);
    if (saved.error) throw new Error(saved.error.message);
    readingUpdated += 1;
  }

  return { listeningUpdated, readingUpdated };
}
