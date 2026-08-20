import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMissingPhaseAtomicRpc } from "@/lib/sync/phase-rpc-compatibility";

describe("phase-atomic rollout compatibility", () => {
  it("falls back only when the requested phase RPC itself is missing", () => {
    expect(
      isMissingPhaseAtomicRpc(
        {
          code: "PGRST202",
          message:
            "Could not find the function public.commit_lesson_phase(p_phase, p_session_id) in the schema cache",
        },
        "commit_lesson_phase",
      ),
    ).toBe(true);

    expect(
      isMissingPhaseAtomicRpc(
        {
          code: "42883",
          message: "function public.reset_incomplete_lesson_phase(uuid) does not exist",
        },
        "reset_incomplete_lesson_phase",
      ),
    ).toBe(true);

    expect(
      isMissingPhaseAtomicRpc(
        {
          code: "PGRST202",
          message:
            "Could not find the function public.some_other_function() in the schema cache",
        },
        "commit_lesson_phase",
      ),
    ).toBe(false);
  });

  it("never converts validation, authorization, or internal dependency errors into legacy fallback", () => {
    expect(
      isMissingPhaseAtomicRpc(
        { code: "55000", message: "Vocabulary phase is incomplete" },
        "commit_lesson_phase",
      ),
    ).toBe(false);
    expect(
      isMissingPhaseAtomicRpc(
        { code: "42501", message: "Active lesson session unavailable" },
        "commit_lesson_phase",
      ),
    ).toBe(false);
    expect(
      isMissingPhaseAtomicRpc(
        {
          code: "42883",
          message:
            "function public.some_internal_dependency(uuid) does not exist",
        },
        "commit_lesson_phase",
      ),
    ).toBe(false);
  });

  it("keeps the old-DB bridge behind a missing-RPC sentinel", () => {
    const source = readFileSync("lib/sync/backend-sync.ts", "utf8");
    const canonicalSuccess = source.indexOf("if (committed.data !== null) return true;");
    const legacyBuilder = source.indexOf("buildLegacyMasteryEvidence(lesson, session, phase)");
    const legacyRpc = source.indexOf("recordLegacyMasteryEvidence(");

    expect(canonicalSuccess).toBeGreaterThan(-1);
    expect(legacyBuilder).toBeGreaterThan(canonicalSuccess);
    expect(legacyRpc).toBeGreaterThan(legacyBuilder);
    expect(source).toContain("if (!committed.ok) return false;");
  });

  it("supports frontend-first rollout while preserving canonical authority after migration", () => {
    const repository = readFileSync(
      "lib/repositories/lesson-session-repository.ts",
      "utf8",
    );
    const migration = readFileSync(
      "supabase/migrations/20260820021600_phase_mastery_rollout_compatibility.sql",
      "utf8",
    );

    expect(repository).toContain(
      'isMissingPhaseAtomicRpc(error, "commit_lesson_phase")',
    );
    expect(repository).toContain(
      'isMissingPhaseAtomicRpc(error, "reset_incomplete_lesson_phase")',
    );
    expect(migration).toContain("lesson_sessions_legacy_phase_commit");
    expect(migration).toContain("commit_legacy_checkpoint_phases");
    expect(migration).toContain("count(distinct activity.id)::integer");
    expect(migration).toContain("v_answered <> 7");
    expect(migration).toContain(
      "revoke all on public.learner_mastery_events from authenticated",
    );
  });
});
