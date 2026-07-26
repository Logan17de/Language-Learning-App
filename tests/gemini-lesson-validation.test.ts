import { describe, expect, it } from "vitest";
import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";

describe("Gemini lesson validation", () => {
  it("matches grammar components separated by a variable slot", () => {
    expect(storyUsesGrammarPattern(
      "王様より女王様のほうが早く起きました。",
      "より〜ほうが",
    )).toBe(true);
  });

  it("matches leading-slot grammar and slash-separated alternatives", () => {
    expect(storyUsesGrammarPattern("ここで写真を撮ってもいいですか。", "〜てもいいですか")).toBe(true);
    expect(storyUsesGrammarPattern("ここで写真を撮ってもよろしいですか。", "〜てもいいですか/〜てもよろしいですか")).toBe(true);
  });

  it("does not accept a partial comparison pattern", () => {
    expect(storyUsesGrammarPattern("王様より早く起きました。", "より〜ほうが")).toBe(false);
  });
});
