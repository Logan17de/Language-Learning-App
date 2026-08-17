import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const homepage = source("app/page.tsx");
const preview = source("components/lesson/lesson-preview.tsx");
const player = source("components/lesson/lesson-player.tsx");
const home = source("components/home/home-dashboard.tsx");
const learn = source("components/learn/lesson-library.tsx");

describe("lesson pause and resume UX stays retired", () => {
  it("does not proactively warn about no-resume behavior before the learner tries to leave", () => {
    for (const surface of [homepage, preview, home, learn]) {
      expect(surface).not.toContain("One-sitting rule");
      expect(surface).not.toContain("Complete in one sitting");
      expect(surface).not.toContain("designed for one sitting");
      expect(surface).not.toContain("There is no pause or resume inside a lesson");
      expect(surface).not.toContain("does not pause for later");
    }
    expect(preview).not.toContain('"Resume lesson"');
    expect(preview).not.toContain("saved progress in this lesson");
    expect(preview).not.toContain("Your progress will be saved locally");
  });

  it("warns only when the learner explicitly tries to leave an unfinished lesson", () => {
    expect(player).toContain("AIko doesn&apos;t pause lessons");
    expect(player).toContain("this attempt");
    expect(player).toContain("won&apos;t be assigned to you again");
    expect(player).toContain("choose a different next lesson");
  });

  it("still routes Home and Learn through lesson details before playback", () => {
    expect(home).toContain("/preview");
    expect(home).not.toContain("selectedLesson.id}/play");
    expect(learn).toContain("/preview");
    expect(learn).toContain("Grammar + translation");
  });
});
