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

describe("phase-atomic lesson Resume UX", () => {
  it("does not restore the retired one-sitting/no-resume messaging", () => {
    for (const surface of [homepage, preview, home, learn, player]) {
      expect(surface).not.toContain("One-sitting rule");
      expect(surface).not.toContain("Complete in one sitting");
      expect(surface).not.toContain("There is no pause or resume inside a lesson");
      expect(surface).not.toContain("does not pause for later");
      expect(surface).not.toContain("AIko doesn&apos;t pause lessons");
    }
  });

  it("explains the phase-boundary Resume rule only when it is relevant", () => {
    expect(player).toContain("Completed phases stay saved");
    expect(player).toContain("restart from its first activity");
    expect(learn).toContain("Completed phases stay saved");
    expect(learn).toContain("restarts from question 1");
  });

  it("exposes separate Resume and Start-new actions on /learn", () => {
    expect(learn).toContain("Resume lesson");
    expect(learn).toContain("Start new lesson");
    expect(learn).toContain("setShowCreationForm(true)");
    expect(learn).toContain("Today&apos;s creation limit is reached");
  });

  it("keeps lesson playback one-way instead of using Back as phase rewind", () => {
    const backStart = player.indexOf("function back()");
    const commitStart = player.indexOf("async function commitAndAdvance", backStart);
    const backBody = player.slice(backStart, commitStart);
    expect(backBody).toContain("setShowExit(true)");
    expect(backBody).not.toContain("currentPhaseIndex - 1");
    expect(backBody).not.toContain("previousPhase");
  });
});
