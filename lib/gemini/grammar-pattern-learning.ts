import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { generateStructured, type JsonSchema } from "@/lib/gemini/structured-output";
import type { LibrarySeedGrammar } from "@/lib/gemini/lesson-engine-v2";

const CONFIDENCE_THRESHOLD = 0.95;

interface GrammarAliasJudgment {
  verdict: "correct" | "wrong";
  confidence: number;
}

function normalizePattern(value: string): string {
  return value.normalize("NFKC").replace(/[〜~]/gu, "～").replace(/\s+/gu, "").trim();
}

async function judgeGrammarAlias(canonicalPattern: string, proposedPattern: string): Promise<GrammarAliasJudgment> {
  const schema: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "confidence"],
    properties: {
      verdict: { type: "string", enum: ["correct", "wrong"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
  };
  const result = await generateStructured<GrammarAliasJudgment>({
    name: "grammar pattern alias judgment",
    prompt: [
      "Decide whether the proposed Japanese grammar pattern is a valid surface-form variation of the canonical grammar pattern.",
      "Accept polite, plain, contracted, and orthographic variations only when they express the same grammatical construction.",
      "Reject merely related grammar, example sentences, explanations, broader phrases, and different meanings.",
      `Canonical pattern: ${canonicalPattern}`,
      `Proposed pattern: ${proposedPattern}`,
      'Return verdict "correct" or "wrong" and a confidence from 0 to 1.',
    ].join("\n"),
    schema,
    validate: (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return ["Judgment must be an object."];
      const record = value as Record<string, unknown>;
      if (record.verdict !== "correct" && record.verdict !== "wrong") return ["Judgment needs a valid verdict."];
      if (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1) return ["Judgment needs confidence between 0 and 1."];
      return [];
    },
  });
  return result.value;
}

export async function canonicalizeLearnedGrammarPatterns(input: {
  requestedPatterns: string[];
  generatedGrammar: LibrarySeedGrammar[];
}): Promise<LibrarySeedGrammar[]> {
  if (input.requestedPatterns.length !== input.generatedGrammar.length) {
    throw new Error("Grammar output must contain exactly the requested number of patterns.");
  }
  if (input.requestedPatterns.length === 0) return [];

  const admin = createAdminClient();
  const catalog = await admin
    .from("grammar_catalog")
    .select("pattern,accepted_patterns")
    .in("pattern", input.requestedPatterns)
    .eq("active", true);
  if (catalog.error) throw new Error(`Grammar aliases could not be loaded: ${catalog.error.message}`);

  const knownAliases = new Map<string, Set<string>>();
  for (const row of catalog.data ?? []) {
    knownAliases.set(row.pattern, new Set([row.pattern, ...(row.accepted_patterns ?? [])].map(normalizePattern)));
  }

  const unused = new Set(input.requestedPatterns);
  const resolved: LibrarySeedGrammar[] = [];
  for (const generated of input.generatedGrammar) {
    const proposed = normalizePattern(generated.pattern);
    let canonical = [...unused].find((pattern) => knownAliases.get(pattern)?.has(proposed));
    if (!canonical) {
      const judgments = await Promise.all([...unused].map(async (pattern) => ({
        pattern,
        judgment: await judgeGrammarAlias(pattern, generated.pattern),
      })));
      const approved = judgments.filter(({ judgment }) =>
        judgment.verdict === "correct" && judgment.confidence >= CONFIDENCE_THRESHOLD,
      );
      if (approved.length !== 1) {
        throw new Error(`Grammar pattern ${generated.pattern} does not uniquely match a requested pattern.`);
      }
      canonical = approved[0].pattern;
      const learned = await admin.rpc("learn_grammar_pattern_alias", {
        p_canonical_pattern: canonical,
        p_alias: generated.pattern,
        p_confidence: approved[0].judgment.confidence,
      });
      if (learned.error) throw new Error(`Grammar alias could not be saved: ${learned.error.message}`);
    }
    unused.delete(canonical);
    resolved.push({ ...generated, pattern: canonical });
  }
  if (unused.size > 0) throw new Error("Grammar output did not cover every requested pattern.");
  return resolved;
}
