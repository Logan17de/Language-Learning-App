import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("app/layout.tsx", "utf8");

describe("legacy progress import UI", () => {
  it("does not mount the automatic device-progress import popup", () => {
    expect(layout).not.toContain("LegacyImportAssistant");
    expect(layout).not.toContain("legacy-import-assistant");
  });
});
