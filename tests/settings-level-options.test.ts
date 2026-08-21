import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("learner settings level options", () => {
  it("shows the level as an earned status rather than a control", () => {
    const source = readFileSync("components/settings/settings-page.tsx", "utf8");

    // The level is earned through mastery and is server-owned, so Settings
    // displays it and explains how it moves instead of offering a picker.
    expect(source).toContain("Current level");
    expect(source).toContain("Your level is earned.");
    expect(source).not.toContain(
      'options={["Beginner", "N5", "N4", "N3", "N2", "N1", "Not sure"]}',
    );
    expect(source).not.toContain("changeLevel");
  });
});
