import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");

describe("leaving a lesson saves without arguing", () => {
  it("does not raise the browser's unsaved-changes prompt", () => {
    // preventDefault in beforeunload is what raises it, including on the way to
    // the results screen — so finishing a lesson ended in a warning that the
    // work might be lost at the moment it had just been committed.
    const guard = player.slice(
      player.indexOf("const handleBeforeUnload"),
      player.indexOf("const handleVisibility"),
    );
    expect(guard).not.toContain("preventDefault");
    expect(guard).not.toContain("returnValue");
  });

  it("still writes the session on the way out", () => {
    const guard = player.slice(
      player.indexOf("const handleBeforeUnload"),
      player.indexOf("const handleVisibility"),
    );
    // Synchronous, and to local storage, so it lands before the page goes.
    expect(guard).toContain("saveLessonSession({ ...session, elapsedSeconds })");
    expect(player).toContain('window.addEventListener("beforeunload", handleBeforeUnload)');
    expect(player).toContain('window.removeEventListener("beforeunload", handleBeforeUnload)');
  });

  it("only shows results once the server has confirmed the completion", () => {
    // A clean exit is not the same as an early one: the results screen is
    // reached only after a canonical result comes back.
    expect(player).toContain("if (!canonicalResult) {");
    const afterGuard = player.slice(player.indexOf("if (!canonicalResult) {"));
    expect(afterGuard).toContain("saveLessonSession(completedSession)");
    expect(afterGuard.indexOf("saveLessonSession(completedSession)")).toBeLessThan(
      afterGuard.indexOf("router.push(`/lesson/${lesson.id}/complete`)"),
    );
  });
});
