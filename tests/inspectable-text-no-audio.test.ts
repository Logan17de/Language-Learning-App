import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/exercises/inspectable-text.tsx", "utf8");

describe("tappable word support contract", () => {
  it("reveals only reading and meaning without pronunciation audio", () => {
    expect(source).toContain('type RevealType = "reading" | "meaning"');
    expect(source).toContain('word.scriptType === "kanji" && stage >= 1');
    expect(source).toContain("stage >= 2");
    expect(source).not.toContain("AudioControl");
    expect(source).not.toContain("showAudio");
    expect(source).not.toContain("Hear pronunciation");
    expect(source).not.toContain("/api/audio/tts");
  });
});
