import { describe, expect, it } from "vitest";
import { learnerVisibleLessons, mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { commuteLesson } from "@/data/mock-lessons";

describe("canonical lesson merge rules", () => {
  it("applies an override once and hides deleted or unpublished lessons", () => {
    const draft = { ...commuteLesson, status: "draft" as const, title: "Edited" };
    const merged = mergeCanonicalLessons([commuteLesson], [], { [commuteLesson.id]: draft }, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Edited");
    expect(learnerVisibleLessons(merged)).toEqual([]);
    expect(mergeCanonicalLessons([commuteLesson], [], {}, [commuteLesson.id])).toEqual([]);
  });
});
