import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const homepage = source("app/page.tsx");
const subscription = source("components/subscription/subscription-page.tsx");

describe("homepage reflects the current AIko product", () => {
  it("describes the canonical six-phase learner journey generically", () => {
    expect(homepage).toContain("One lesson. Six connected phases.");
    for (const phase of [
      "Story",
      "Vocabulary",
      "Grammar",
      "Reading",
      "Listening",
      "Speaking",
    ]) {
      expect(homepage).toContain(`title: "${phase}"`);
    }

    expect(homepage).not.toContain("Seven connected stages");
    expect(homepage).not.toContain('title: "Review"');
    expect(homepage).not.toContain("Vocabulary + Kanji");
  });

  it("explains adaptation without language-specific mechanics", () => {
    expect(homepage).toContain("Story word support");
    expect(homepage).toContain("Progress works quietly in the background");
    expect(homepage).not.toContain("English-to-Japanese");
    expect(homepage).not.toContain("translation");
    expect(homepage).not.toContain("Review performance");
  });

  it("does not publish the founder story section", () => {
    const header = source("components/layout/public-header.tsx");
    expect(homepage).not.toContain("Our story");
    expect(homepage).not.toContain('id="founder"');
    expect(header).not.toContain("Our story");
    expect(header).not.toContain("#founder");
  });

  it("does not advertise retired or unsupported Premium features as current", () => {
    expect(homepage).not.toContain("Advanced reading and pronunciation feedback");
    expect(homepage).not.toContain("Adaptive review and learner memory");
    expect(homepage).not.toContain("Future languages and premium tutors when available");
    expect(homepage.toLowerCase()).not.toContain("interest");
    expect(subscription.toLowerCase()).not.toContain("interest");

    for (const feature of [
      "Custom-topic AI lesson generation",
      "Unlimited adaptive lesson access",
      "Extended speaking practice",
    ]) {
      expect(subscription).toContain(feature);
      expect(homepage).toContain(feature);
    }
  });

  it("presents Premium as coming soon without public yen pricing", () => {
    expect(homepage).toContain("Coming soon");
    expect(homepage).toContain("Premium checkout is not connected yet");
    expect(homepage).not.toContain("¥");
  });
});
