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
 * ながら are all the same pattern. Matching therefore has to tolerate the
 * placeholder mark -- but only as a last resort, because dropping it merges
 * patterns that are genuinely different. しか～ない ("only") and しかない ("have
 * no choice but") collapse onto the same string, as do つ～つ and つつ. Stripping
 * first would have taught one of each pair under the other's explanation.
 *
 * So there are two forms: the exact name, which is always tried first, and the
 * stripped name, which is only ever used when it identifies exactly one pattern
 * in the whole catalog.
 */
function exactForm(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

function strippedForm(value: string): string {
  return exactForm(value).replace(/[〜～~・]/gu, "");
}

function parseCatalog(source: string): CuratedGrammarPattern[] {
  const entries: CuratedGrammarPattern[] = [];
  const normalizedSource = source.replace(/\r\n?/gu, "\n");
  for (const block of normalizedSource.split(/\n(?=## )/u)) {
    const heading = /^## (N[1-5])_G(\d+) — (.+?)\r?\n/u.exec(block);
    if (!heading) continue;
    const [, level, ordinal, pattern] = heading;
    if (!isJlptLevel(level)) continue;

    const structure =
      /### 1\) Structure\r?\n```text\r?\n([\s\S]*?)\r?\n```/u.exec(block);
    const usage =
      /### 2\) When to use it\r?\n([\s\S]*?)\r?\n\r?\n### 3\)/u.exec(
        block,
      );
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
let exactIndexCache: Map<string, CuratedGrammarPattern> | null = null;
let strippedIndexCache: Map<string, CuratedGrammarPattern | null> | null = null;

export function loadCuratedGrammarCatalog(): CuratedGrammarPattern[] {
  if (catalogCache) return catalogCache;
  catalogCache = parseCatalog(
    readFileSync(join(process.cwd(), CURATED_GRAMMAR_FILE), "utf8"),
  );
  return catalogCache;
}

function buildIndexes(): void {
  if (exactIndexCache && strippedIndexCache) return;
  const exact = new Map<string, CuratedGrammarPattern>();
  // null marks a stripped form that more than one pattern answers to, so it is
  // never used to pick between them.
  const stripped = new Map<string, CuratedGrammarPattern | null>();

  const catalog = loadCuratedGrammarCatalog();

  // Two passes, and the order matters. A pattern's own name always wins over an
  // alternative some other entry happens to list: じゃない is N3_G031's own name
  // and also half of N5_G002's "じゃない / ではない", and indexing in one pass let
  // the N5 alternative claim it, so the N3 pattern was taught as the N5 one.
  const record = (key: string, entry: CuratedGrammarPattern) => {
    const name = exactForm(key);
    if (!name) return;
    if (!exact.has(name)) exact.set(name, entry);

    const loose = strippedForm(key);
    if (!loose) return;
    const seen = stripped.get(loose);
    if (seen === undefined) stripped.set(loose, entry);
    else if (seen && seen.id !== entry.id) stripped.set(loose, null);
  };

  for (const entry of catalog) record(entry.pattern, entry);
  for (const entry of catalog) {
    // "だ / です" should still be found by either half.
    const alternatives = entry.pattern.split("/");
    if (alternatives.length < 2) continue;
    for (const alternative of alternatives) record(alternative, entry);
  }

  exactIndexCache = exact;
  strippedIndexCache = stripped;
}

/** The curated entry for a lesson's grammar target, when the bank has one. */
export function curatedGrammarPattern(
  pattern: string,
): CuratedGrammarPattern | null {
  if (!pattern.trim()) return null;
  buildIndexes();
  const exact = exactIndexCache!.get(exactForm(pattern));
  if (exact) return exact;
  // Only when the stripped name belongs to exactly one pattern.
  return strippedIndexCache!.get(strippedForm(pattern)) ?? null;
}
