import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  git?: {
    deploymentEnabled?: boolean | Record<string, boolean>;
  };
};

describe("Vercel deployment policy", () => {
  it("deploys only staging and main automatically", () => {
    const policy = vercelConfig.git?.deploymentEnabled;

    expect(policy).toEqual({
      "**": false,
      staging: true,
      main: true,
    });
  });
});
