import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("app/layout.tsx", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const grammarPhase = readFileSync(
  "components/lesson/grammar-phase.tsx",
  "utf8",
);
const grammarContract = readFileSync(
  "lib/gemini/grammar-question-contract.ts",
  "utf8",
);

describe("Japanese typography and grammar hints", () => {
  it("uses the soft Japanese sans family across lesson text", () => {
    expect(layout).toContain('import { Noto_Sans_JP } from "next/font/google"');
    expect(layout).toContain('variable: "--font-japanese"');
    expect(globals).toContain("var(--font-japanese)");
    expect(globals).toContain(":lang(ja)");
    expect(globals).toContain(".font-serif");
    expect(globals).toContain('"Yu Gothic UI"');
  });

  it("does not render a learner hint control", () => {
    expect(grammarPhase).not.toContain("Show hint");
    expect(grammarPhase).not.toContain("Hide hint");
    expect(grammarPhase).not.toContain("Lightbulb");
    expect(grammarPhase).not.toContain("hintQuestionId");
    expect(grammarPhase).not.toContain("question.hintFront");
    expect(grammarPhase).not.toContain("question.hintBack");
  });

  it("does not request hints from the grammar generation API", () => {
    expect(grammarContract).not.toContain("hintFront");
    expect(grammarContract).not.toContain("hintBack");
    expect(grammarContract).not.toMatch(/\bhint\b/i);
    expect(grammarContract).toContain('required: [\n          "format_id"');
    expect(grammarContract).toContain('"choices"');
    expect(grammarContract).toContain('"answer"');
  });
});
