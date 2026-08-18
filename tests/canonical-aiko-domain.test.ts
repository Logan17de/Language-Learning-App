import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIKO_CANONICAL_HOST, AIKO_CANONICAL_ORIGIN } from "@/lib/app-url";

const proxy = readFileSync("proxy.ts", "utf8");
const supabaseConfig = readFileSync("lib/supabase/config.ts", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const schedulerDocs = readFileSync("docs/custom-lesson-worker-scheduler.md", "utf8");

describe("AIko canonical production domain", () => {
  it("uses aiko.zetbros.com as the only canonical production origin", () => {
    expect(AIKO_CANONICAL_ORIGIN).toBe("https://aiko.zetbros.com");
    expect(AIKO_CANONICAL_HOST).toBe("aiko.zetbros.com");
  });

  it("redirects production infrastructure hostnames to the canonical domain", () => {
    expect(proxy).toContain('process.env.VERCEL_ENV === "production"');
    expect(proxy).toContain("AIKO_CANONICAL_HOST");
    expect(proxy).toContain("NextResponse.redirect(canonicalUrl, 308)");
  });

  it("uses the canonical origin for production auth URLs and metadata", () => {
    expect(supabaseConfig).toContain('process.env.VERCEL_ENV === "production"');
    expect(supabaseConfig).toContain("return AIKO_CANONICAL_ORIGIN");
    expect(layout).toContain("metadataBase: new URL(AIKO_CANONICAL_ORIGIN)");
  });

  it("keeps the production custom-lesson worker on the canonical domain", () => {
    expect(schedulerDocs).toContain(
      "https://aiko.zetbros.com/api/internal/custom-lessons/process",
    );
  });
});
