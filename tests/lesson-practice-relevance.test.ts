import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("lesson practice relevance data flow", () => {
  it("passes the lesson story into Vocabulary and Grammar practice", () => {
    const groups = source("lib/gemini/lesson-activity-groups.ts");
    expect(groups).toContain('japaneseStory: input.draft.lines.map((line) => line.japanese).join("")');
    expect(groups).toContain("vocabularyQuestionsPrompt");
    expect(groups).toContain("grammarQuestionsPrompt");
  });

  it("passes lesson topic/context into Reading, Listening, Translation, and Speaking", () => {
    const groups = source("lib/gemini/lesson-activity-groups.ts");
    const listening = source("lib/gemini/listening-region-generation.ts");
    const translation = source("lib/lesson/translation-practice.ts");

    expect(groups).toContain("topic: input.topic");
    expect(groups).toContain("japaneseStory,");
    expect(groups).toContain("generateReadingRegion");
    expect(groups).toContain("generateSpeakingRegion");
    expect(listening).toContain("topic: input.topic");
    expect(listening).toContain("japaneseStory: input.japaneseStory");
    expect(translation).toContain("topic: lesson.topic");
    expect(translation).toContain("targets,");
  });
});
