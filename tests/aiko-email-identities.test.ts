import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AIKO_ACCOUNT_EMAIL,
  AIKO_SUPPORT_EMAIL,
  AIKO_SUPPORT_MAILTO,
} from "@/lib/contact";

const supportPage = readFileSync("app/support/page.tsx", "utf8");
const privacyPage = readFileSync("app/privacy/page.tsx", "utf8");
const termsPage = readFileSync("app/terms/page.tsx", "utf8");
const emailDocs = readFileSync("docs/email-identities.md", "utf8");

describe("AIko email identities", () => {
  it("keeps support and automated account mail separate", () => {
    expect(AIKO_SUPPORT_EMAIL).toBe("support.aiko@zetbros.com");
    expect(AIKO_ACCOUNT_EMAIL).toBe("account.aiko@zetbros.com");
    expect(AIKO_SUPPORT_MAILTO).toBe("mailto:support.aiko@zetbros.com");
  });

  it("uses the support mailbox on user-facing contact surfaces", () => {
    expect(supportPage).toContain("AIKO_SUPPORT_EMAIL");
    expect(privacyPage).toContain("AIKO_SUPPORT_EMAIL");
    expect(termsPage).toContain("AIKO_SUPPORT_EMAIL");
    expect(supportPage).not.toContain("AIKO_ACCOUNT_EMAIL");
    expect(privacyPage).not.toContain("AIKO_ACCOUNT_EMAIL");
    expect(termsPage).not.toContain("AIKO_ACCOUNT_EMAIL");
  });

  it("reserves the account mailbox for automated Supabase Auth mail", () => {
    expect(emailDocs).toContain("account.aiko@zetbros.com");
    expect(emailDocs).toContain("signup confirmation");
    expect(emailDocs).toContain("password recovery/reset");
    expect(emailDocs).toContain("support.aiko@zetbros.com");
    expect(emailDocs).toContain("mail.spacemail.com");
    expect(emailDocs).toContain("admin@zetbros.com");
  });
});
