import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808113000_import_jlpt_reference_catalogs.sql",
  "utf8",
);
const prompt = readFileSync("lib/admin-complete-lesson-prompt.ts", "utf8");

function blockCount(tag: string): number {
  const match = migration.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, "u"));
  if (!match) throw new Error(`Missing ${tag} catalog block.`);
  return match[1].split(/\r?\n/u).map((item) => item.trim()).filter(Boolean).length;
}

describe("JLPT reference catalog import", () => {
  it("ships the complete user-supplied kanji classification", () => {
    expect(blockCount("kn5")).toBe(80);
    expect(blockCount("kn4")).toBe(170);
    expect(blockCount("kn3")).toBe(370);
    expect(blockCount("kn2")).toBe(380);
    expect(blockCount("kn1")).toBe(1136);
    expect(migration).toContain("v_kanji_count <> 2136");
  });

  it("ships the complete user-supplied grammar classification", () => {
    expect(blockCount("gn5")).toBe(82);
    expect(blockCount("gn4")).toBe(112);
    expect(blockCount("gn3")).toBe(136);
    expect(blockCount("gn2")).toBe(124);
    expect(blockCount("gn1")).toBe(187);
    expect(migration).toContain("v_grammar_count <> 641");
  });

  it("preserves rich rows while marking catalog-only library placeholders for review", () => {
    expect(migration).toContain("update public.kanji_records record");
    expect(migration).toContain("update public.grammar_records record");
    expect(migration).toContain("'imported', 'needs_review'");
    expect(migration).toContain("'catalogOnly', true");
    expect(migration).toContain("char_length(character) <> 1");
  });

  it("treats target kanji as focus characters rather than a kanji whitelist", () => {
    expect(prompt).toContain("required focus characters, not a whitelist");
    expect(prompt).toContain("may appear alone or inside a natural compound or inflected word");
    expect(prompt).toContain("freely use other kanji when they are natural and appropriate");
    expect(prompt).toContain("top-level kanji array at exactly the 5 supplied target characters");
  });
});
