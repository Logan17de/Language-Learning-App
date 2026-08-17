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
    expect(preview).toContain("This lesson is designed for one sitting.");
    expect(preview).toContain("There is no pause or resume inside a lesson.");
  });

  it("warns before an explicit lesson exit", () => {
    expect(player).toContain("AIko doesn&apos;t pause lessons");
    expect(player).toContain("this attempt");
    expect(player).toContain("start from the beginning next time");
  });

  it("routes Home and Learn through the commitment preview before playback", () => {
    expect(home).toContain("/preview");
    expect(home).not.toContain("selectedLesson.id}/play");
    expect(learn).toContain("/preview");
    expect(learn).toContain("Complete in one sitting");
  });
});
