import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("standalone review stays retired", () => {
  it("does not expose Review in learner navigation or Home", () => {
    const sidebar = source("components/navigation/app-sidebar.tsx");
    const bottomNav = source("components/navigation/bottom-nav.tsx");
    const home = source("components/home/home-dashboard.tsx");

    expect(sidebar).not.toContain('href: "/review"');
    expect(bottomNav).not.toContain('href: "/review"');
    expect(home).not.toContain('href="/review"');
    expect(home).not.toContain("Open review");
  });

  it("does not keep retired learner review routes", () => {
    expect(existsSync(resolve(process.cwd(), "app/review/page.tsx"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "app/review/session/page.tsx"))).toBe(false);
  });

  it("keeps learner mastery available for internal targeting", () => {
    const repository = source("lib/repositories/mastery-repository.ts");

    expect(repository).toContain('["Tables"]["learner_mastery"]');
    expect(repository).toContain('from("learner_mastery")');
  });
});
