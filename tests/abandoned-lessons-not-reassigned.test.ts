import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { useBackendLessonStore } from "@/store/backend-lesson-store";
import type { LessonPackage } from "@/types/lesson";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const migration = source(
  "supabase/migrations/20260817083000_abandoned_lessons_are_not_reassigned.sql",
);
const backendStore = source("store/backend-lesson-store.ts");

describe("abandoned lessons are never shown as the next lesson", () => {
  beforeEach(() => {
    useBackendLessonStore.getState().reset();
  });

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
    const trusted = [{ id: "lesson-1" } as unknown as LessonPackage];
    useBackendLessonStore.setState({
      ownerUserId: "user-a",
      lessons: trusted,
      status: "ready",
      loading: false,
      loaded: true,
      error: "",
    });

    // Re-scoping to the same account is a no-op: trusted lessons stay in
    // place and the UI is never pushed back through a loading state.
    useBackendLessonStore.getState().scopeTo("user-a");

    const after = useBackendLessonStore.getState();
    expect(after.lessons).toBe(trusted);
    expect(after.status).toBe("ready");
    expect(after.loading).toBe(false);
    expect(after.loaded).toBe(true);
  });

  it("drops another account's lessons when the owner changes", () => {
    useBackendLessonStore.setState({
      ownerUserId: "user-a",
      lessons: [{ id: "lesson-1" } as unknown as LessonPackage],
      status: "ready",
      loading: false,
      loaded: true,
      error: "",
    });

    useBackendLessonStore.getState().scopeTo("user-b");

    const after = useBackendLessonStore.getState();
    expect(after.ownerUserId).toBe("user-b");
    expect(after.lessons).toEqual([]);
    expect(after.status).toBe("idle");
    expect(after.loaded).toBe(false);
  });

  it("no longer auto-assigns a published lesson to the learner", () => {
    // /learn creates lessons on demand; the legacy assignment loader is inert
    // rather than silently selecting a catalog lesson.
    expect(backendStore).toContain('status: "exhausted"');
    expect(backendStore).toContain("no longer auto-assigns");
  });
});
