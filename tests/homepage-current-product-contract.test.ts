import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const homepage = source("app/page.tsx");
const subscription = source("components/subscription/subscription-page.tsx");

describe("homepage reflects the current AIko product", () => {
  it("describes the canonical six-phase learner journey", () => {
    expect(homepage).toContain("One lesson. Six connected phases.");
    expect(homepage).toContain('title: "Vocabulary + Kanji"');
    expect(homepage).toContain('title: "Grammar"');
    expect(homepage).toContain('title: "Reading"');
    expect(homepage).toContain('title: "Listening"');
    expect(homepage).toContain('title: "Speaking"');

    expect(homepage).not.toContain("One lesson. Seven connected stages.");
    expect(homepage).not.toContain('title: "Review"');
  });

  it("keeps translation inside Grammar and mastery in the background", () => {
    expect(homepage).toContain("adaptive English-to-Japanese translation");
    expect(homepage).toContain("There is no separate Review stage to complete.");
    expect(homepage).toContain("AI-validated translations");
    expect(homepage).not.toContain("Review performance");
  });

  it("does not advertise retired or roadmap Premium features as current", () => {
    expect(homepage).not.toContain("Advanced reading and pronunciation feedback");
    expect(homepage).not.toContain("Adaptive review and learner memory");
    expect(homepage).not.toContain("Future languages and premium tutors when available");

    for (const feature of [
      "Interest-based lesson recommendations",
      "Custom-topic AI lesson generation",
      "Unlimited adaptive lesson access",
      "Extended speaking practice",
    ]) {
      expect(subscription).toContain(feature);
      expect(homepage).toContain(feature);
    }
  });

  it("discloses the current Premium checkout state", () => {
    expect(subscription).toContain("Checkout is not connected yet");
    expect(homepage).toContain("Premium checkout is not connected yet");
  });
});
