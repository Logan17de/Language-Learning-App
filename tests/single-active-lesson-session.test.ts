import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = readFileSync("lib/repositories/lesson-session-repository.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260824064500_single_active_lesson_session.sql",
  "utf8",
);

describe("opening a lesson is decided by the server", () => {
  it("no longer reads then writes from the browser", () => {
    // Two browsers both saw no active session and both created one, which is
    // how a learner ended up holding thirteen at once.
    const open = repo.slice(
      repo.indexOf("async startOrResume"),
      repo.indexOf("async saveCheckpoint"),
    );
    expect(open).toContain('client.rpc("start_or_resume_lesson_session"');
    expect(open).not.toContain(".insert(");
    expect(open).not.toContain('.eq("status", "active")');
  });

  it("resolves the whole thing in one statement", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("set status = 'abandoned'");
    expect(migration).toContain("and id <> v_session.id");
  });
});

describe("switching lessons does not cost the learner their place", () => {
  it("reopens the session the lesson already had", () => {
    // Abandoning without this would hand a returning learner a fresh session.
    expect(migration).toContain("and status <> 'completed'");
    expect(migration).toContain("set status = 'active', updated_at = now()");
  });

  it("starts over once a lesson is finished", () => {
    expect(migration).toContain("status <> 'completed'");
  });

  it("closes what had already piled up", () => {
    expect(migration).toContain("update public.lesson_sessions stale");
    expect(migration).toContain("order by keep.started_at desc");
  });

  it("refuses to finish if a learner still holds more than one", () => {
    expect(migration).toContain("a learner may hold only one open lesson");
  });
});
