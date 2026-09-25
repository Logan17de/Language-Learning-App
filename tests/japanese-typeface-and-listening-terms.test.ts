import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { japaneseLang } from "@/lib/japanese-input";

const inspectable = readFileSync("components/exercises/inspectable-text.tsx", "utf8");
const card = readFileSync("components/exercises/multiple-choice-card.tsx", "utf8");
const listening = readFileSync("components/lesson/listening-phase.tsx", "utf8");

describe("Japanese text declares its language", () => {
  it("recognises Japanese and leaves other text alone", () => {
    expect(japaneseLang("男の人は何を注文しますか")).toBe("ja");
    expect(japaneseLang("ひらがな")).toBe("ja");
    expect(japaneseLang("カタカナ")).toBe("ja");
    expect(japaneseLang("Choose the best answer.")).toBeUndefined();
    expect(japaneseLang("")).toBeUndefined();
  });

  it("marks it wherever a learner reads Japanese", () => {
    // The stylesheet gives :lang(ja) the Japanese face. Unmarked text falls to
    // the Latin stack, and Inter has no Japanese glyphs, so the browser
    // substitutes one of its own — the same sentence looked thinner in a choice
    // than in the question above it.
    expect(inspectable).toContain("lang={japaneseLang(text)}");
    expect(card).toContain("lang={japaneseLang(choice)}");
  });
});

describe("listening questions have tappable words", () => {
  it("treats an empty term list as absent", () => {
    // Generation writes an empty array, and `??` keeps it, so nothing was ever
    // tappable on a listening question.
    expect(listening).not.toContain("exercise.inspectableTerms ?? lesson.story");
    expect(listening).toContain("exercise.inspectableTerms?.length");
    expect(listening).toContain("lesson.story.flatMap((line) => line.words)");
  });
});
