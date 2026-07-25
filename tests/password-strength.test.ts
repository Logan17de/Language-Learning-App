import { describe, expect, it } from "vitest";
import { getPasswordStrength, isStrongEnough } from "@/lib/auth/password-strength";

describe("password strength", () => {
  it("requires a varied password before signup", () => {
    expect(isStrongEnough("password")).toBe(false);
    expect(isStrongEnough("Good7!A")).toBe(false);
    expect(isStrongEnough("Good7!Ab")).toBe(true);
    expect(isStrongEnough("GoodPass9!")).toBe(true);
  });

  it("reports every strength signal", () => {
    const result = getPasswordStrength("Aiko!2026");
    expect(result.score).toBe(4);
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
  });
});
