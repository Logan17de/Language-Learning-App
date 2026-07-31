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

  it("renders the story in the real lesson player with readiness on the right", () => {
    expect(buildingRoute).toContain("ProgressiveStoryPage");
    expect(progressive).toContain("<LessonPlayerShell");
    expect(progressive).toContain('phaseName="Story"');
    expect(progressive).toContain("Lesson readiness");
    expect(progressive).toContain("lg:grid-cols-[minmax(0,1fr)_19rem]");
    expect(progressive).toContain("lg:sticky lg:top-28");
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
  });
});
