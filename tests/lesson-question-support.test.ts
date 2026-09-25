import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const story = readFileSync("components/lesson/story-phase.tsx", "utf8");
const vocabulary = readFileSync("components/lesson/vocabulary-phase.tsx", "utf8");
const grammar = readFileSync("components/lesson/grammar-phase.tsx", "utf8");
const multipleChoice = readFileSync(
  "components/exercises/multiple-choice-card.tsx",
  "utf8",
);
const feedback = readFileSync(
  "components/exercises/answer-feedback.tsx",
  "utf8",
);

describe("lesson question support rules", () => {
  it("keeps vocabulary help in the story but removes story audio", () => {
    expect(story).toContain("data-word-support-trigger");
    expect(story).not.toContain("AudioControl");
    expect(story).not.toContain("Hear story line");
    expect(story).not.toContain("Hear pronunciation");
  });

  it("does not make vocabulary or grammar answer choices inspectable", () => {
    expect(multipleChoice).toContain("inspectChoices = true");
    expect(multipleChoice).toContain("{inspectChoices ? (");
    expect(vocabulary).toContain("inspectChoices={false}");
    expect(grammar).toContain("inspectChoices={false}");
  });

  it("keeps grammar practice hint-free without exposing answers", () => {
    expect(grammar).not.toContain("Show hint");
    expect(grammar).not.toContain("Hide hint");
    expect(grammar).not.toContain("question.hintFront");
    expect(grammar).not.toContain("question.hintBack");
    expect(grammar).not.toContain("text={question.correctAnswer}");
  });

  it("uses neutral feedback after an incorrect answer", () => {
    expect(feedback).toContain('const detail = correct');
    expect(feedback).toContain(
      '"Check the correct answer and compare it with your response."',
    );
    expect(feedback).toContain("{detail}");
  });
});
