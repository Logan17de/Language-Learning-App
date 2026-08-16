import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const multipleChoice = readFileSync(
  "components/exercises/multiple-choice-card.tsx",
  "utf8",
);
const vocabulary = readFileSync(
  "components/lesson/vocabulary-phase.tsx",
  "utf8",
);
const grammar = readFileSync(
  "components/lesson/grammar-phase.tsx",
  "utf8",
);
const globals = readFileSync("app/globals.css", "utf8");

describe("answer feedback interaction", () => {
  it("celebrates a correct multiple-choice answer", () => {
    expect(multipleChoice).toContain("data-answer-celebration");
    expect(multipleChoice).toContain("answered && selectedAnswer && isCorrect");
    expect(globals).toContain("@keyframes aiko-celebration-core");
    expect(globals).toContain("@keyframes aiko-celebration-spark");
  });

  it("keeps the next action beside answer feedback", () => {
    expect(multipleChoice).toContain("data-answer-result-row");
    expect(multipleChoice).toContain("answerAction?: ReactNode");
    expect(multipleChoice).toContain("sm:flex-row");
    expect(vocabulary).toContain("answerAction={");
    expect(grammar).toContain("answerAction={nextAction}");
  });

  it("keeps vocabulary copy aligned with the seven-question contract", () => {
    expect(vocabulary).toContain("Seven questions build from direct recognition");
    expect(vocabulary).not.toContain("Thirteen questions");
  });
});
