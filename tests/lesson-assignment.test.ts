import { describe, expect, it } from "vitest";
import { mockLessons } from "@/data/mock-lessons";
import { selectNextLesson } from "@/lib/lesson-assignment";

describe("lesson assignment", () => {
  it("keeps free selection level-based and independent of interests", () => {
    const first = selectNextLesson({ lessons: mockLessons, level: "N4", interests: ["Health"], premium: false, excludedLessonIds: [], seed: "learner-1" });
    const second = selectNextLesson({ lessons: mockLessons, level: "N4", interests: ["Technology"], premium: false, excludedLessonIds: [], seed: "learner-1" });
    expect(first?.lesson.id).toBe(second?.lesson.id);
    expect(first?.mode).toBe("free_random");
  });

  it("uses interests for Pro and never returns an excluded lesson", () => {
    const health = mockLessons.find((lesson) => lesson.topic === "Health")!;
    const result = selectNextLesson({ lessons: mockLessons, level: "N4", interests: ["Health"], premium: true, excludedLessonIds: [], seed: "learner-1" });
    expect(result?.lesson.id).toBe(health.id);
    const next = selectNextLesson({ lessons: mockLessons, level: "N4", interests: ["Health"], premium: true, excludedLessonIds: [health.id], seed: "learner-1" });
    expect(next?.lesson.id).not.toBe(health.id);
  });
});
