import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync("components/exercises/multiple-choice-card.tsx", "utf8");

/**
 * Vocabulary questions store an empty string for `cue`, not null, whenever the
 * question lives entirely in the prompt ("What is the correct reading of 目的?").
 * Five of seven questions in a real lesson are shaped that way.
 */
describe("the ask column always has the question in it", () => {
  it("treats an empty cue as absent rather than as content", () => {
    // `??` only falls back on null/undefined, so "" passed through as the lead
    // text and the entire left column rendered blank.
    expect(card).not.toContain("cue ?? prompt");
    expect(card).toContain('const cueText = cue?.trim() ? cue : ""');
    expect(card).toContain('const promptText = prompt?.trim() ? prompt : ""');
    expect(card).toContain("const leadText = cueText || promptText");
  });

  it("falls back to the prompt for the lead and does not hide it", () => {
    // Suppressing the support line when there is no cue is right; suppressing
    // the lead as well is what left nothing on screen.
    expect(card).toContain('const supportText = cueText ? promptText : ""');
    expect(card).toContain("{leadText && (");
  });

  it("sizes the lead by whether a cue is really present", () => {
    expect(card).toContain('cueText ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"');
  });

  it("labels the choices with whatever text actually rendered", () => {
    expect(card).toContain("aria-label={leadText || supportText}");
  });
});
