import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reading = readFileSync("components/lesson/reading-phase.tsx", "utf8");
const multipleChoice = readFileSync(
  "components/exercises/multiple-choice-card.tsx",
  "utf8",
);
const sessionTypes = readFileSync("types/lesson-session.ts", "utf8");
const lessonTypes = readFileSync("types/lesson.ts", "utf8");

describe("reading comprehension contract", () => {
  it("uses the shared MCQ control for new reading questions and keeps the legacy written fallback", () => {
    expect(reading).toContain("lesson.readingQuestions ?? []");
    expect(reading).toContain("question?.choices");
    expect(reading).toContain("<MultipleChoiceCard");
    expect(reading).toContain("onSelect={(choice) => submit(choice)}");
    expect(multipleChoice).toContain('role="radiogroup"');
    expect(reading).toContain("<textarea");
    expect(reading).toContain("Save answer");
    expect(reading).not.toContain("MediaRecorder");
    expect(reading).not.toContain("/api/audio/transcribe");
  });

  it("locks submitted MCQ choices and supplies the canonical answer without pronunciation scoring", () => {
    expect(reading).toContain("correctAnswer={question.answer}");
    expect(reading).toContain("answered={Boolean(submitted)}");
    expect(reading).toContain("lockAfterAnswer");
    expect(reading).toContain("answerCorrect={answerCorrect}");
    expect(reading).toContain("answerAction={");
    expect(multipleChoice).toContain("choice === correctAnswer");
    expect(reading).not.toContain("response === question.answer");
    expect(reading).not.toContain("pronunciation");
  });

  it("stores answers and completes only after all questions are answered", () => {
    expect(sessionTypes).toContain("interface ReadingComprehensionAnswer");
    expect(sessionTypes).toContain("readingAnswers: ReadingComprehensionAnswer[]");
    expect(lessonTypes).toContain("interface ReadingComprehensionQuestion");
    expect(lessonTypes).toContain("choices?: string[];");
    expect(reading).toContain("readingAnswers: nextAnswers");
    expect(reading).toContain("readingComplete: nextAnswers.length >= questions.length");
  });

  it("keeps the reading passage inspectable and reveals English after completion", () => {
    expect(reading).toContain("<InspectableText");
    expect(reading).toContain("inspectableTerms");
    expect(reading).toContain("View English translation");
    expect(reading).toContain("complete || session.readingComplete");
  });
});
