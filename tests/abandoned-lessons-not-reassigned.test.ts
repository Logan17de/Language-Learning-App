import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const migration = source(
  "supabase/migrations/20260817083000_abandoned_lessons_are_not_reassigned.sql",
);
const backendStore = source("store/backend-lesson-store.ts");

describe("abandoned lessons are never shown as the next lesson", () => {
  it("retires an assignment when its active lesson session is abandoned", () => {
    expect(migration).toContain(
      "check (status in ('assigned', 'started', 'completed', 'abandoned'))",
    );
    expect(migration).toContain("if new.status = 'abandoned' then");
    expect(migration).toContain("set status = 'abandoned'");
    expect(migration).toContain("after update of status on public.lesson_sessions");
  });

  it("repairs assignments left started by already-abandoned sessions", () => {
    expect(migration).toContain("where assignment.status = 'started'");
    expect(migration).toContain("abandoned_session.status = 'abandoned'");
    expect(migration).toContain("active_session.status = 'active'");
  });

  it("never reuses a started assignment as the next lesson", () => {
    expect(migration).toContain(
      "where user_id = auth.uid()\n    and status = 'assigned'",
    );
    expect(migration).toContain("'level-v3-no-resume'");
    expect(migration).toContain(
      "Started, abandoned, and completed lessons are never surfaced again as next lessons.",
    );
  });

  it("revalidates a trusted same-account assignment without flashing a loader", () => {
    expect(backendStore).not.toContain("get().loaded) return");
    expect(backendStore).toContain("const blocking =");
    expect(backendStore).toContain('current.status === "idle"');
    expect(backendStore).toContain('current.status === "error"');
    expect(backendStore).toContain("if (blocking) {");
    expect(backendStore).toContain('status: "loading"');
    expect(backendStore).toContain(
      "const hasTrustedLesson = !blocking && get().lessons.length > 0",
    );
    expect(backendStore).toContain(
      'status: hasTrustedLesson ? "ready" : "error"',
    );
  });
});
