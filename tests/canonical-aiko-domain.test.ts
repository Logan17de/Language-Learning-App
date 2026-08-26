import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIKO_CANONICAL_HOST, AIKO_CANONICAL_ORIGIN } from "@/lib/app-url";
import { getAppUrl } from "@/lib/supabase/config";

const proxy = readFileSync("proxy.ts", "utf8");
const supabaseCliConfig = readFileSync("supabase/config.toml", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const schedulerDocs = readFileSync("docs/custom-lesson-worker-scheduler.md", "utf8");

describe("AIko canonical production domain", () => {
  it("uses aiko.zetbros.com as the only canonical production origin", () => {
    expect(AIKO_CANONICAL_ORIGIN).toBe("https://aiko.zetbros.com");
    expect(AIKO_CANONICAL_HOST).toBe("aiko.zetbros.com");
    expect(getAppUrl()).toBe(AIKO_CANONICAL_ORIGIN);
  });

  it("redirects production infrastructure hostnames to the canonical domain", () => {
    expect(proxy).toContain('process.env.VERCEL_ENV === "production"');
    expect(proxy).toContain("AIKO_CANONICAL_HOST");
    expect(proxy).toContain("NextResponse.redirect(canonicalUrl, 308)");
  });

  it("uses only the canonical host for auth redirects", () => {
    expect(supabaseCliConfig).toContain('site_url = "https://aiko.zetbros.com"');
    expect(supabaseCliConfig).toContain(
      'additional_redirect_urls = ["https://aiko.zetbros.com/**"]',
    );
    expect(supabaseCliConfig).not.toContain("localhost:3000/**");
    expect(supabaseCliConfig).not.toContain("git-staging");
    expect(supabaseCliConfig).not.toContain("vercel.app/**");
  });

  it("uses the canonical origin for metadata", () => {
    expect(layout).toContain("metadataBase: new URL(AIKO_CANONICAL_ORIGIN)");
  });

  it("keeps the production custom-lesson worker on the canonical domain", () => {
    expect(schedulerDocs).toContain(
      "https://aiko.zetbros.com/api/internal/custom-lessons/process",
    );
  });
});
