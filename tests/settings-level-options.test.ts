import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("learner settings level options", () => {
  it("exposes every supported JLPT level including N1", () => {
    const source = readFileSync("components/settings/settings-page.tsx", "utf8");

    expect(source).toContain(
      'options={["Beginner", "N5", "N4", "N3", "N2", "N1", "Not sure"]}',
    );
  });
});
