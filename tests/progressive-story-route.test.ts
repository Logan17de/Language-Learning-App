import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customTopic = readFileSync(
  "components/custom-topic/custom-topic-page.tsx",
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
  it("leaves the custom-topic builder as soon as the story request is ready", () => {
    expect(customTopic).toContain('searchParams.get("requestId")');
    expect(customTopic).toContain(
      "router.replace(`/lesson/building/${encodeURIComponent(activeRequest)}`)",
    );
    expect(customTopic).toContain(
      "router.replace(`/lesson/building/${encodeURIComponent(result.requestId)}`)",
    );
    expect(customTopic).not.toContain("<InspectableText");
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
    expect(progressive).toContain("Story audio is off");
    expect(progressive).not.toContain("<AudioControl");
  });

  it("polls background readiness and advances the completed story to vocabulary", () => {
    expect(progressive).toContain("/api/custom-lessons/status?requestId=");
    expect(progressive).toContain("2_500");
    expect(progressive).toContain("completedGroups");
    expect(progressive).toContain("createEmptyLessonSession(lessonId)");
    expect(progressive).toContain("session.currentPhaseIndex = 1");
    expect(progressive).toContain("session.storyComplete = true");
    expect(progressive).toContain("router.push(`/lesson/${lessonId}/play`)");
    expect(progressive).toContain('continueLabel={lessonReady ? "Vocabulary"');
    expect(lessonPlayer).toContain(
      "const storedSessions = useAppStore.getState().lessonSessions",
    );
    expect(lessonPlayer).toContain("createEmptyLessonSession(lesson.id)");
    expect(lessonPlayer).toContain("queueMicrotask");
    expect(lessonPlayer).toContain("setSession(fallback)");
    expect(lessonPlayer).toContain(
      "const next = preferAdvancedSession(local, restored)",
    );
    expect(lessonPlayer).not.toContain("startOrResumeLesson");
    expect(lessonPlayer).not.toContain("initialPersistedSessionRef");
  });

  it("carries a database route checkpoint into a legacy-mapped lesson", () => {
    expect(lessonResolver).toContain(
      "<LessonPlayer lesson={lesson} routeLessonId={lessonId} />",
    );
    expect(lessonPlayer).toContain("storedSessions[routeLessonId]");
    expect(lessonPlayer).toContain(
      "normalizeLessonSession(lesson.id, routeSession)",
    );
    expect(lessonPlayer).toContain("routeLessonId !== lesson.id");
    expect(lessonPlayer).toContain("saveLessonSession(fallback)");
  });
});
