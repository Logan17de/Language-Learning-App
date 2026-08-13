import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("review data stays internal", () => {
  it("does not expose Review in learner navigation", () => {
    const sidebar = source("components/navigation/app-sidebar.tsx");
    const bottomNav = source("components/navigation/bottom-nav.tsx");

    expect(sidebar).not.toContain('href: "/review"');
    expect(bottomNav).not.toContain('href: "/review"');
  });

  it("redirects old learner review routes to progress", () => {
    const reviewPage = source("app/review/page.tsx");
    const reviewSessionPage = source("app/review/session/page.tsx");

    expect(reviewPage).toContain('redirect("/progress")');
    expect(reviewSessionPage).toContain('redirect("/progress")');
  });

  it("keeps the review queue available for internal mastery logic", () => {
    const repository = source("lib/repositories/review-repository.ts");

    expect(repository).toContain('Tables]["review_queue"]');
    expect(repository).toContain('from("review_queue")');
  });
});
