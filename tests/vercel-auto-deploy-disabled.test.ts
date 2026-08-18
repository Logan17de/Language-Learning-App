import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  git?: { deploymentEnabled?: boolean };
};

describe("Vercel deployment policy", () => {
  it("keeps automatic Git deployments disabled for every branch", () => {
    expect(vercelConfig.git?.deploymentEnabled).toBe(false);
  });
});
