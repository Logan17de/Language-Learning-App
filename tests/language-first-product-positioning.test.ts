import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const landing = source("app/page.tsx");
const layout = source("app/layout.tsx");
const login = source("app/login/page.tsx");
const signup = source("app/signup/page.tsx");
const home = source("components/home/home-dashboard.tsx");

describe("AIko product positioning", () => {
  it("presents AIko as a language-learning platform with one availability note", () => {
    expect(landing).toContain("Adaptive language learning");
    expect(landing).toContain("Available now: Japanese · More languages coming");
    expect(landing.match(/Japanese/g) ?? []).toHaveLength(1);
    expect(layout).not.toContain("Japanese");
  });

  it("keeps the public learning explanation language neutral", () => {
    for (const term of [
      "Vocabulary + Kanji",
      "English-to-Japanese",
      "JLPT",
      "Tokyo",
      "Review stage",
    ]) {
      expect(landing).not.toContain(term);
    }
    expect(landing).toContain("Story, Vocabulary, Grammar, Reading, Listening, and Speaking");
  });

  it("keeps generic account and dashboard copy from framing AIko as one-language-only", () => {
    expect(login).not.toContain("Continue your Japanese path");
    expect(signup).not.toContain("Build Japanese that lasts");
    expect(home).not.toContain("make the Japanese stick");
    expect(home).toContain("make the language stick");
  });
});
