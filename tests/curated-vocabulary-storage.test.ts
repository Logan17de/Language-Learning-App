import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260815070000_fix_curated_story_vocabulary_storage.sql",
  ),
  "utf8",
);

const enrichment = readFileSync(
  resolve(process.cwd(), "lib/gemini/simple-story-enrichment.ts"),
  "utf8",
);

describe("curated story vocabulary storage", () => {
  it("writes through the deployed vocabulary_records columns", () => {
    expect(migration).toContain("insert into public.vocabulary_records");
    expect(migration).toContain("dictionary_form");
    expect(migration).toContain("lexicon_schema_version");
    expect(migration).toContain("source_model");
    expect(migration).not.toMatch(/\bcreated_by\s*,/);
  });

  it("writes through the deployed story_vocabulary_enrichments columns", () => {
    expect(migration).toContain("insert into public.story_vocabulary_enrichments");
    expect(migration).toContain("request_id,\n      user_id,\n      vocabulary_id");
    expect(migration).toContain("word,\n      reading,\n      meaning,\n      source_model");
    expect(migration).not.toMatch(/\bsurface\s*,/);
    expect(migration).not.toContain("updated_at = excluded.updated_at");
  });

  it("keeps the runtime RPC pinned to the curated CSV source", () => {
    expect(enrichment).toContain('CURATED_VOCABULARY_SOURCE_MODEL = "jlpt-curated-csv"');
    expect(enrichment).toContain('rpc("store_story_vocabulary_enrichment"');
    expect(migration).toContain("Curated JLPT vocabulary source is required");
    expect(migration).toContain("'jlpt-curated-csv'");
  });
});
