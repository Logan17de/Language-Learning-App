import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reading = readFileSync("components/lesson/reading-phase.tsx", "utf8");
const sessionTypes = readFileSync("types/lesson-session.ts", "utf8");
const lessonTypes = readFileSync("types/lesson.ts", "utf8");

describe("reading comprehension contract", () => {
  it("uses a written Japanese question flow without speaking controls", () => {
    expect(reading).toContain("lesson.readingQuestions ?? []");
    expect(reading).toContain("日本語で答えてください");
    expect(reading).toContain("<textarea");
    expect(reading).toContain("Save answer");
    expect(reading).not.toContain("MediaRecorder");
    expect(reading).not.toContain("/api/audio/transcribe");
  });

  it("locks submitted answers and shows a reference without exact-match scoring", () => {
    expect(reading).toContain("disabled={Boolean(submitted)}");
    expect(reading).toContain("Reference answer");
    expect(reading).toContain("Your wording may be different");
    expect(reading).not.toContain("response === question.answer");
    expect(reading).not.toContain("pronunciation");
  });

  it("stores answers and completes only after all questions are answered", () => {
    expect(sessionTypes).toContain("interface ReadingComprehensionAnswer");
    expect(sessionTypes).toContain("readingAnswers: ReadingComprehensionAnswer[]");
    expect(lessonTypes).toContain("interface ReadingComprehensionQuestion");
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
