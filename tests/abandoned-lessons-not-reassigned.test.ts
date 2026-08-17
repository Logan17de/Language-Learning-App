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

  it("revalidates the backend assignment whenever Learn mounts", () => {
    expect(backendStore).not.toContain("get().loaded) return");
    expect(backendStore).toContain(
      "stale assignments must never be shown as \"next lesson\"",
    );
    expect(backendStore).toContain("lessons: [],\n        loading: false");
  });
});
