import { describe, expect, it } from "vitest";
import {
  createInspectableTermLookup,
  resolveInspectableTerm,
} from "@/lib/gemini/inspectable-canonicalization";
import type { InspectableTerm } from "@/lib/gemini/lesson-types";

const canonical: InspectableTerm = {
  libraryId: "library-queen",
  surface: "女王",
  reading: "じょおう",
  meaning: "queen",
  scriptType: "kanji",
};

describe("inspectable term canonicalization", () => {
  const lookup = createInspectableTermLookup([canonical]);

  it("replaces a model-created ID by matching the visible surface", () => {
    expect(resolveInspectableTerm({
      libraryId: "invented-id",
      surface: "女王",
      reading: "じょおう",
      meaning: "invented meaning",
      scriptType: "kanji",
    }, lookup)).toEqual(canonical);
  });

  it("keeps an inflected visible surface while using trusted library metadata", () => {
    expect(resolveInspectableTerm({
      libraryId: "library-queen",
      surface: "女王様",
      reading: "made-up",
      meaning: "made-up",
      scriptType: "kanji",
    }, lookup)).toEqual({
      ...canonical,
      surface: "女王様",
    });
  });

  it("omits metadata that cannot be mapped to the reusable library", () => {
    expect(resolveInspectableTerm({
      libraryId: "invented-id",
      surface: "未知語",
      reading: "みちご",
    }, lookup)).toBeNull();
  });
});
