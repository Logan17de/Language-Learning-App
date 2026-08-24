import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { JLPTLevel } from "@/types/lesson";

/**
 * The manually curated JLPT grammar bank committed under Grammar/.
 *
 * grammar_records holds 641 patterns but only their names: 632 of them carry no
 * structure, no usage note and no example. That is why every lesson asked the
 * model to write those three things from scratch, so the same pattern was
 * explained differently each time it appeared, and the explanation was only ever
 * as good as that one generation.
 *
 * This is the same arrangement the vocabulary catalogs already use: the file is
 * the authority, read at generation time, with no dictionary or model enrichment
 * in the path.
 */

export const CURATED_GRAMMAR_FILE =
  "Grammar/jlpt_grammar_patterns_all_levels.md" as const;

export interface CuratedGrammarPattern {
  /** Catalog identifier, for example N5_G001. */
  id: string;
  pattern: string;
  level: JLPTLevel;
  /** How the pattern is built, verbatim from the bank. */
  structure: string;
  /** When a learner should reach for it. */
  usage: string;
  exampleJapanese: string;
  exampleEnglish: string;
}

const LEVELS: readonly JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

function isJlptLevel(value: string): value is JLPTLevel {
  return (LEVELS as readonly string[]).includes(value);
}

/**
 * Pattern names are written inconsistently across sources: 〜ながら, ～ながら and
 * ながら are the same pattern, and the bank writes alternatives as "だ / です".
 * Compare on a stripped form so a lesson target still finds its entry.
 */
function normalizePattern(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[〜～~・]/gu, "")
    .replace(/\s+/gu, "")
    .toLowerCase();
}

function parseCatalog(source: string): CuratedGrammarPattern[] {
  const entries: CuratedGrammarPattern[] = [];
  for (const block of source.split(/\n(?=## )/u)) {
    const heading = /^## (N[1-5])_G(\d+) — (.+?)\n/u.exec(block);
    if (!heading) continue;
    const [, level, ordinal, pattern] = heading;
    if (!isJlptLevel(level)) continue;

    const structure = /### 1\) Structure\n```text\n([\s\S]*?)\n```/u.exec(block);
    const usage = /### 2\) When to use it\n([\s\S]*?)\n\n### 3\)/u.exec(block);
    const japanese = /\*\*Japanese:\*\* (.+)/u.exec(block);
    const english = /\*\*English:\*\* (.+)/u.exec(block);
    if (!structure || !usage || !japanese || !english) continue;

    entries.push({
      id: `${level}_G${ordinal}`,
      pattern: pattern.trim(),
      level,
      structure: structure[1].trim(),
      usage: usage[1].trim(),
      exampleJapanese: japanese[1].trim(),
      exampleEnglish: english[1].trim(),
    });
  }
  return entries;
}

let catalogCache: CuratedGrammarPattern[] | null = null;
let indexCache: Map<string, CuratedGrammarPattern> | null = null;

export function loadCuratedGrammarCatalog(): CuratedGrammarPattern[] {
  if (catalogCache) return catalogCache;
  catalogCache = parseCatalog(
    readFileSync(join(process.cwd(), CURATED_GRAMMAR_FILE), "utf8"),
  );
  return catalogCache;
}

function catalogIndex(): Map<string, CuratedGrammarPattern> {
  if (indexCache) return indexCache;
  const index = new Map<string, CuratedGrammarPattern>();
  for (const entry of loadCuratedGrammarCatalog()) {
    // The whole name, then each alternative it lists, so "だ / です" is found by
    // either half. First writer wins, so a bare name never loses to an
    // alternative belonging to some other entry.
    const keys = [entry.pattern, ...entry.pattern.split("/")];
    for (const key of keys) {
      const normalized = normalizePattern(key);
      if (normalized && !index.has(normalized)) index.set(normalized, entry);
    }
  }
  indexCache = index;
  return index;
}

/** The curated entry for a lesson's grammar target, when the bank has one. */
export function curatedGrammarPattern(
  pattern: string,
): CuratedGrammarPattern | null {
  if (!pattern.trim()) return null;
  return catalogIndex().get(normalizePattern(pattern)) ?? null;
}
