import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileRepository = readFileSync(
  "lib/repositories/profile-repository.ts",
  "utf8",
);

describe("onboarding RPC regression", () => {
  it("keeps complete_onboarding bound to the Supabase client", () => {
    expect(profileRepository).toContain(
      'rpcClient.rpc("complete_onboarding", {',
    );
    expect(profileRepository).not.toContain("const rpc = client.rpc");
  });

  it("does not restore the removed interests profile write", () => {
    expect(profileRepository).not.toContain("interests:");
    expect(profileRepository).not.toContain("p_interests");
  });
});
