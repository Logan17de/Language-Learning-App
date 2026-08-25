import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// /learn is the single learner lesson-creation surface. The old
// components/custom-topic/custom-topic-page.tsx builder was deliberately
// deleted and must not come back as a competing flow.
const learnLibrary = readFileSync(
  "components/learn/lesson-library.tsx",
  "utf8",
);
const retiredCustomTopicRoute = readFileSync(
  "app/custom-topic/page.tsx",
  "utf8",
);
const progressive = readFileSync(
  "components/lesson/progressive-story-page.tsx",
  "utf8",
);
const lessonPlayer = readFileSync(
  "components/lesson/lesson-player.tsx",
  "utf8",
);
const lessonResolver = readFileSync(
  "components/lesson/lesson-route-resolver.tsx",
  "utf8",
);
const buildingRoute = readFileSync(
  "app/lesson/building/[requestId]/page.tsx",
  "utf8",
);

describe("progressive custom lesson reading", () => {
  it("leaves the /learn builder as soon as the story request is ready", () => {
    expect(learnLibrary).toContain("requestId?: string;");
    expect(learnLibrary).toContain(
      "router.replace(`/lesson/building/${encodeURIComponent(result.requestId)}`)",
    );
    // A lesson that is already built skips the building route entirely.
    expect(learnLibrary).toContain(
      "router.replace(`/lesson/${result.lesson_id}/play`)",
    );
    // The builder never renders story text itself; that is the player's job.
    expect(learnLibrary).not.toContain("<InspectableText");
  });

  it("keeps /custom-topic retired instead of a competing builder", () => {
    expect(retiredCustomTopicRoute).toContain('redirect("/learn")');
    expect(retiredCustomTopicRoute).not.toContain("CustomTopicPage");
  });

  it("renders the story in the real lesson player with transient build notices", () => {
    expect(buildingRoute).toContain("ProgressiveStoryPage");
    expect(progressive).toContain("<LessonPlayerShell");
    expect(progressive).toContain('phaseName="Story"');
    expect(progressive).toContain("<BuildStatusToast");
    expect(progressive).toContain('data-testid="lesson-build-toast"');
    expect(progressive).toContain("fixed right-4 top-24");
    expect(progressive).toContain("setVisible(false)");
    expect(progressive).not.toContain("Lesson readiness");
    expect(progressive).not.toContain("lg:sticky lg:top-28");
    expect(progressive).toContain("<InspectableText");
    expect(progressive).toContain("Tap a word when you need its reading or meaning");
    expect(progressive).not.toContain("supported words");
    expect(progressive).not.toContain("<AudioControl");
  });

  it("polls background readiness and advances the completed story to vocabulary", () => {
    expect(progressive).toContain("/api/custom-lessons/status?requestId=");
    expect(progressive).toContain("2_500");
    expect(progressive).toContain("completedGroups");
    expect(progressive).toContain("createEmptyLessonSession(lessonId)");
    expect(progressive).toContain("session.currentPhaseIndex = 1");
    expect(progressive).toContain("session.storyComplete = true");
    expect(progressive).toContain("router.replace(`/lesson/${lessonId}/play`)");
    expect(progressive).toContain("continueToLesson();");
    expect(progressive).toContain("window.sessionStorage");
    expect(progressive).not.toContain("document.hidden ? 10_000");
    expect(progressive).toContain('continueLabel={canContinue ? "Vocabulary"');
    expect(progressive).toContain("lessonPreloadSettled");
    expect(lessonPlayer).toContain(
      "const storedSessions = useAppStore.getState().lessonSessions",
    );
    expect(lessonPlayer).toContain("createEmptyLessonSession(lesson.id)");
    expect(lessonPlayer).toContain("queueMicrotask");
    expect(lessonPlayer).toContain("setSession(fallback)");
    // preferAdvancedSession was renamed preferDurableSession when resume
    // became phase-atomic: the restored checkpoint is a durable phase
    // boundary, not the furthest question the learner reached.
    expect(lessonPlayer).toContain("preferDurableSession(");
    expect(lessonPlayer).toContain("restartIncompleteLessonPhase(selected)");
    expect(lessonPlayer).not.toContain("startOrResumeLesson");
    expect(lessonPlayer).not.toContain("initialPersistedSessionRef");
  });

  it("carries a database route checkpoint into a legacy-mapped lesson", () => {
    expect(lessonResolver).toContain("<LessonPlayer");
    expect(lessonResolver).toContain("lesson={lesson}");
    expect(lessonResolver).toContain("routeLessonId={lessonId}");
    expect(lessonPlayer).toContain("storedSessions[routeLessonId]");
    expect(lessonPlayer).toContain(
      "normalizeLessonSession(lesson.id, routeSession)",
    );
    expect(lessonPlayer).toContain("routeLessonId !== lesson.id");
    expect(lessonPlayer).toContain("saveLessonSession(fallback)");
  });
});
