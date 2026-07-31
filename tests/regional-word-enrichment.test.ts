import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const regional = readFileSync(
  "lib/gemini/structured-output.ts",
  "utf8",
);

describe("regional missing-word enrichment", () => {
  it("splits large missing-word outputs and repairs only rejected regions", () => {
    expect(regional).toContain('const MISSING_WORD_NAME = "missing-word library enrichment"');
    expect(regional).toContain("OPENAI_ENRICHMENT_BATCH_SIZE");
    expect(regional).toContain("OPENAI_ENRICHMENT_CONCURRENCY");
    expect(regional).toContain("mapWithConcurrency");
    expect(regional).toContain("failedRequestIndices");
    expect(regional).toContain("Approved regions are not included and must not be regenerated");
    expect(regional).toContain("item repair");
  });

  it("does not send standalone copulas and polite auxiliaries to permanent vocabulary enrichment", () => {
    expect(regional).toContain('"でした"');
    expect(regional).toContain("isAuxiliaryOnlyRequest");
    expect(regional).toContain("skippedAuxiliaryCount");
    expect(regional).toContain("terms: []");
  });

  it("makes the exact missing kanji obligation explicit per word region", () => {
    expect(regional).toContain("requiredKanjiDetails");
    expect(regional).toContain("include exactly one complete kanjiDetails object");
    expect(regional).toContain("An empty kanjiDetails array is allowed only when requiredKanjiDetails is empty");
  });
});
