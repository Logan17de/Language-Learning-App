import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { JLPTLevel } from "@/types/lesson";

export interface CuratedVocabularyEntry {
  id: string;
  word: string;
  /** The primary reading. Always a single run of kana. */
  reading: string;
  /** Every curated reading, primary first. Compounds have exactly one. */
  readings: string[];
  meaning: string;
  studyLevel: JLPTLevel;
  sourceFile: string;
}

/**
 * A stored reading must be one unbroken run of kana - vocabulary_records links
 * each reading to a kana_records row and rejects anything else.
 */
const KANA_ONLY = /^[ぁ-ゖゝゞァ-ヺヽヾー]+$/u;

/**
 * The solo-kanji catalog lists every curated reading for a kanji in one field,
 * separated by pipes ("じん | にん | ひと"), which is why it also carries a
 * reading_count column. Splitting it is not optional: the whole string was
 * being stored as if it were a single reading, and the database rejected it,
 * failing vocabulary enrichment for any story containing such a kanji - 1296
 * of the 2136 curated kanji.
 */
function parseCuratedReadings(value: string): string[] {
  return value
    .split("|")
    .map((reading) => reading.normalize("NFKC").trim())
    .filter((reading) => KANA_ONLY.test(reading));
}

export interface CuratedVocabularyMatch extends CuratedVocabularyEntry {
  start: number;
  end: number;
}

const COMPOUND_CATALOG_FILES = [
  "Vocabs/jlpt_n5_compounds.csv",
  "Vocabs/jlpt_n4_compounds.csv",
  "Vocabs/jlpt_n3_compounds.csv",
  "Vocabs/jlpt_n2_compounds(1).csv",
  "Vocabs/jlpt_n1_compounds.csv",
] as const;

export const SOLO_KANJI_CATALOG_FILE =
  "Vocabs/jlpt_all_kanji_with_kana_readings.csv" as const;

let catalogCache: CuratedVocabularyEntry[] | null = null;

function parseCsvRows(input: string): string[][] {
  const source = input.replace(/^\uFEFF/u, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  return rows;
}

function isJlptLevel(value: string): value is JLPTLevel {
  return value === "N5" || value === "N4" || value === "N3" || value === "N2" || value === "N1";
}

function loadCompoundCatalogFile(sourceFile: string): CuratedVocabularyEntry[] {
  const rows = parseCsvRows(readFileSync(join(process.cwd(), sourceFile), "utf8"));
  const header = rows[0]?.map((value) => value.trim()) ?? [];
  const idIndex = header.indexOf("id");
  const wordIndex = header.indexOf("word");
  const readingIndex = header.indexOf("reading");
  const meaningIndex = header.indexOf("english_meaning");
  const levelIndex = header.indexOf("study_level");
  if ([idIndex, wordIndex, readingIndex, meaningIndex, levelIndex].some((index) => index < 0)) {
    throw new Error(`Curated vocabulary CSV ${sourceFile} has an unexpected header.`);
  }

  return rows.slice(1).flatMap((row) => {
    const id = row[idIndex]?.trim() ?? "";
    const word = row[wordIndex]?.normalize("NFKC").trim() ?? "";
    const reading = row[readingIndex]?.normalize("NFKC").trim() ?? "";
    const meaning = row[meaningIndex]?.trim() ?? "";
    const studyLevel = row[levelIndex]?.trim() ?? "";
    const readings = parseCuratedReadings(reading);
    if (!id || !word || readings.length === 0 || !meaning || !isJlptLevel(studyLevel)) {
      return [];
    }
    return [
      { id, word, reading: readings[0], readings, meaning, studyLevel, sourceFile },
    ];
  });
}

function loadSoloKanjiCatalogFile(sourceFile: string): CuratedVocabularyEntry[] {
  const rows = parseCsvRows(readFileSync(join(process.cwd(), sourceFile), "utf8"));
  const header = rows[0]?.map((value) => value.trim()) ?? [];
  const idIndex = header.indexOf("id");
  const kanjiIndex = header.indexOf("kanji");
  const readingIndex = header.indexOf("readings_kana");
  const meaningIndex = header.indexOf("english_meaning");
  const levelIndex = header.indexOf("introduced_level");
  if ([idIndex, kanjiIndex, readingIndex, meaningIndex, levelIndex].some((index) => index < 0)) {
    throw new Error(`Curated solo-kanji CSV ${sourceFile} has an unexpected header.`);
  }

  return rows.slice(1).flatMap((row) => {
    const id = row[idIndex]?.trim() ?? "";
    const word = row[kanjiIndex]?.normalize("NFKC").trim() ?? "";
    const reading = row[readingIndex]?.normalize("NFKC").trim() ?? "";
    const meaning = row[meaningIndex]?.trim() ?? "";
    const studyLevel = row[levelIndex]?.trim() ?? "";
    const readings = parseCuratedReadings(reading);
    if (
      !id ||
      Array.from(word).length !== 1 ||
      readings.length === 0 ||
      !meaning ||
      !isJlptLevel(studyLevel)
    ) {
      return [];
    }
    return [
      { id, word, reading: readings[0], readings, meaning, studyLevel, sourceFile },
    ];
  });
}

export function loadCuratedVocabularyCatalog(): CuratedVocabularyEntry[] {
  if (catalogCache) return catalogCache;
  const byId = new Map<string, CuratedVocabularyEntry>();
  for (const sourceFile of COMPOUND_CATALOG_FILES) {
    for (const entry of loadCompoundCatalogFile(sourceFile)) {
      if (!byId.has(entry.id)) byId.set(entry.id, entry);
    }
  }
  for (const entry of loadSoloKanjiCatalogFile(SOLO_KANJI_CATALOG_FILE)) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }
  catalogCache = [...byId.values()];
  return catalogCache;
}

/**
 * Finds exact curated vocabulary spellings in the generated story. When words
 * overlap, the longest spelling at each position wins (日本人 over 日本, and a
 * known compound over its individual kanji). Solo-kanji entries therefore act
 * as a fallback only where no longer curated vocabulary match occupies that
 * character. Returned entries are unique but ordered by first occurrence.
 */
export function matchCuratedStoryVocabularyOccurrences(
  japanese: string,
): CuratedVocabularyMatch[] {
  const story = japanese.normalize("NFKC");
  const byStart = new Map<number, CuratedVocabularyMatch[]>();

  for (const entry of loadCuratedVocabularyCatalog()) {
    const word = entry.word.normalize("NFKC");
    let start = story.indexOf(word);
    while (start >= 0) {
      const match = { ...entry, start, end: start + word.length };
      const current = byStart.get(start) ?? [];
      current.push(match);
      byStart.set(start, current);
      start = story.indexOf(word, start + Math.max(1, word.length));
    }
  }

  const selected: CuratedVocabularyMatch[] = [];
  let occupiedUntil = 0;
  for (let start = 0; start < story.length; start += 1) {
    if (start < occupiedUntil) continue;
    const candidates = byStart.get(start);
    if (!candidates?.length) continue;
    candidates.sort((left, right) =>
      (right.end - right.start) - (left.end - left.start) ||
      Number(left.sourceFile === SOLO_KANJI_CATALOG_FILE) -
        Number(right.sourceFile === SOLO_KANJI_CATALOG_FILE) ||
      left.id.localeCompare(right.id),
    );
    const best = candidates[0]!;
    selected.push(best);
    occupiedUntil = best.end;
  }

  return selected;
}

export function matchCuratedStoryVocabulary(japanese: string): CuratedVocabularyMatch[] {
  const seen = new Set<string>();
  return matchCuratedStoryVocabularyOccurrences(japanese).filter((match) => {
    if (seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });
}
