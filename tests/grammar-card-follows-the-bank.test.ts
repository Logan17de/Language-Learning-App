import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const grammar = readFileSync("components/lesson/grammar-phase.tsx", "utf8");
const library = readFileSync("components/learn/lesson-library.tsx", "utf8");
const groups = readFileSync("lib/gemini/lesson-activity-groups.ts", "utf8");

describe("the grammar card shows the curated bank", () => {
  it("takes structure, usage and example from the catalog", () => {
    expect(groups).toContain("formation: curated?.structure || item.formation");
    expect(groups).toContain("usage: curated?.usage || item.usage");
    expect(groups).toContain("example: curated?.exampleJapanese || item.example");
    expect(groups).toContain("translation: curated?.exampleEnglish || item.translation");
  });

  it("no longer prints a model-written meaning above them", () => {
    // The bank has no meaning field, so this was the one line the model still
    // wrote — and it came back as a Japanese paragraph saying what the usage
    // note already said, in a different voice.
    expect(grammar).not.toContain("{point.meaning}");
  });

  it("calls the example an example, since it comes from the bank", () => {
    expect(grammar).not.toContain("From the story");
    expect(grammar).toContain("Example");
  });

  it("marks the Japanese it renders", () => {
    expect(grammar).toContain('lang="ja"');
  });
});

describe("nothing offers a section that was removed", () => {
  it("does not send the learner on to Translation", () => {
    expect(grammar).not.toContain("Continue to Translation");
    expect(grammar).not.toContain("English-to-Japanese");
    expect(grammar).toContain("Continue to Reading");
  });

  it("does not advertise Translation on the learn page", () => {
    expect(library).not.toContain('title="Translation"');
    expect(library).not.toContain("Turn English back into natural Japanese");
  });
});
