import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const preview = source("components/lesson/lesson-preview.tsx");
const player = source("components/lesson/lesson-player.tsx");
const home = source("components/home/home-dashboard.tsx");
const learn = source("components/learn/lesson-library.tsx");

describe("lesson pause and resume UX stays retired", () => {
  it("does not expose pause or resume actions in lesson preview", () => {
    expect(preview).not.toContain('"Resume lesson"');
    expect(preview).not.toContain("saved progress in this lesson");
    expect(preview).not.toContain("Your progress will be saved locally");
    expect(preview).toContain("Finish the lesson in one session.");
    expect(preview).toContain("there is no Pause or Resume action");
  });

  it("warns before an explicit lesson exit", () => {
    expect(player).toContain("AIko doesn&apos;t pause lessons");
    expect(player).toContain("this attempt");
    expect(player).toContain("start from the beginning next time");
  });

  it("sets the same expectation before starting from Home or Learn", () => {
    expect(home).toContain("AIko does not pause lessons for later");
    expect(learn).toContain("lessons are not paused for later");
  });
});
