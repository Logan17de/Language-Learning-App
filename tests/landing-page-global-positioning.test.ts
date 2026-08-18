import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const landing = readFileSync("app/page.tsx", "utf8");
const header = readFileSync("components/layout/public-header.tsx", "utf8");
const brand = readFileSync("components/ui/brand.tsx", "utf8");
const globals = readFileSync("app/globals.css", "utf8");
const authActions = readFileSync(
  "components/auth/public-auth-actions.tsx",
  "utf8",
);

describe("global landing page positioning", () => {
  it("keeps AIko branding global and Japanese to one availability note", () => {
    expect(brand).not.toContain("愛子");
    expect(landing).toContain("Available now: Japanese · More languages coming");
    expect(landing.match(/Japanese/g) ?? []).toHaveLength(1);
    expect(landing).not.toContain("Kanji");
    expect(landing).not.toContain("JLPT");
    expect(landing).not.toContain("Tokyo");
  });

  it("does not present unavailable public pricing as a live paid product", () => {
    expect(landing).not.toContain("¥");
    expect(landing).toContain("Premium checkout is not connected yet");
    expect(landing).toContain("Coming soon");
    expect(landing).toContain('signedOutHref={plan.primary ? "/signup?next=/subscription" : "/signup"}');
  });

  it("keeps authenticated conversion actions and accessible navigation", () => {
    expect(landing).not.toContain("hideWhenSignedIn");
    expect(landing).toContain('href="#main-content"');
    expect(landing).toContain('id="main-content"');
    expect(header).toContain('aria-expanded={mobileOpen}');
    expect(header).toContain('id="public-mobile-navigation"');
    expect(landing).toContain("How lessons work");
  });

  it("avoids forced full-screen marketing sections and Japanese-first UI fonts", () => {
    expect(landing).not.toContain("min-h-[calc(100svh-5rem)]");
    expect(globals).toContain(
      'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    );
    expect(globals).toContain(":lang(ja)");
    expect(globals).toContain("var(--font-japanese)");
  });

  it("reads public auth from the shared provider rather than each CTA", () => {
    expect(authActions).toContain("usePublicAuthState");
    expect(authActions).not.toContain("authService.hasSession()");
  });
});
