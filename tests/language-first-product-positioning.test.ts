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
  it("presents AIko as a language-learning product with Japanese available first", () => {
    expect(landing).toContain("Learn languages through lessons");
    expect(landing).toContain("Japanese is the first language available in AIko");
    expect(layout).toContain("Launching first with Japanese");
  });

  it("keeps generic account and dashboard copy from framing AIko as Japanese-only", () => {
    expect(login).not.toContain("Continue your Japanese path");
    expect(signup).not.toContain("Build Japanese that lasts");
    expect(home).not.toContain("make the Japanese stick");
    expect(home).toContain("make the language stick");
  });

  it("still describes Japanese-specific mechanics honestly for the first course", () => {
    expect(landing).toContain("In the Japanese course");
    expect(landing).toContain("English-to-Japanese");
    expect(landing).toContain("Vocabulary + Kanji");
  });
});
