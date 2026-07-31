import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customTopic = readFileSync(
  "components/custom-topic/custom-topic-page.tsx",
  "utf8",
);
const progressiveReader = readFileSync(
  "components/custom-topic/progressive-lesson-page.tsx",
  "utf8",
);
const progressiveRoute = readFileSync(
  "app/lesson/building/[requestId]/page.tsx",
  "utf8",
);

describe("progressive custom lesson reader", () => {
  it("leaves the custom-topic form as soon as the story is approved", () => {
    expect(customTopic).toContain(
      "router.replace(`/lesson/building/${encodeURIComponent(result.requestId)}`)",
    );
    expect(customTopic).toContain(
      "router.replace(`/lesson/building/${encodeURIComponent(activeRequest)}`)",
    );
    expect(customTopic).not.toContain("<InspectableText");
    expect(customTopic).not.toContain("Story ready</Badge>");
  });

  it("opens the approved story inside the lesson-player layout", () => {
    expect(progressiveRoute).toContain("<ProgressiveLessonPage requestId={requestId} />");
    expect(progressiveReader).toContain("<LessonPlayerShell");
    expect(progressiveReader).toContain('phaseName="Story"');
    expect(progressiveReader).toContain("phaseNumber={1}");
    expect(progressiveReader).toContain("totalPhases={7}");
    expect(progressiveReader).toContain("<InspectableText");
    expect(progressiveReader).toContain("Story audio is off");
  });

  it("shows background readiness beside the reading", () => {
    expect(progressiveReader).toContain("lg:sticky lg:top-28");
    expect(progressiveReader).toContain("Lesson readiness");
    expect(progressiveReader).toContain("<GenerationProgress");
    expect(progressiveReader).toContain("completedGroups.length");
    expect(progressiveReader).toContain("audioStatus");
    expect(progressiveReader).toContain("The lesson is playable now");
  });

  it("recovers by request id and advances into the finalized lesson", () => {
    expect(progressiveReader).toContain("/api/custom-lessons/status?requestId=");
    expect(progressiveReader).toContain("createEmptyLessonSession(lessonId)");
    expect(progressiveReader).toContain("session.currentPhaseIndex = 1");
    expect(progressiveReader).toContain("session.storyComplete = true");
    expect(progressiveReader).toContain("router.push(`/lesson/${lessonId}/play`)");
  });
});
