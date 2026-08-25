import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const homepage = source("app/page.tsx");
const subscription = source("components/subscription/subscription-page.tsx");
const profile = source("components/profile/profile-page.tsx");
const support = source("components/support/support-page.tsx");

describe("homepage reflects the current AIko product", () => {
  it("describes the canonical six-phase learner journey generically", () => {
    expect(homepage).toContain("One story, six quick phases.");
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

  it("advertises only Premium entitlements enforced by the product", () => {
    expect(homepage).not.toContain("Advanced reading and pronunciation feedback");
    expect(homepage).not.toContain("Adaptive review and learner memory");
    expect(homepage).not.toContain("Future languages and premium tutors when available");
    expect(homepage.toLowerCase()).not.toContain("interest");
    expect(subscription.toLowerCase()).not.toContain("interest");

    for (const feature of [
      "Five lesson creations each day",
      "Listening practice with lesson audio",
      "Speaking practice with live transcription",
    ]) {
      expect(subscription).toContain(feature);
      expect(homepage).toContain(feature);
    }
    for (const unsupported of [
      "Unlimited adaptive lesson access",
      "Deeper progress analytics",
      "Complete learning insights",
    ]) {
      expect(subscription).not.toContain(unsupported);
      expect(homepage).not.toContain(unsupported);
      expect(profile).not.toContain(unsupported);
      expect(support).not.toContain(unsupported);
    }
    expect(support).not.toContain("Paid subscriptions have not launched");
    expect(support).not.toContain("unlimited sessions");
  });

  it("presents live Dodo billing at the truthful base price", () => {
    expect(homepage).toContain("$10 / month");
    expect(homepage).toContain("Dodo Payments shows the final local currency");
    expect(homepage).not.toContain("Coming soon");
    expect(homepage).not.toContain("Premium checkout is not connected yet");
    expect(homepage).not.toContain("¥");
  });
});
