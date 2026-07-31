import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customRoute = readFileSync("app/custom-topic/page.tsx", "utf8");
const transition = readFileSync(
  "components/custom-topic/custom-topic-route-client.tsx",
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
    expect(customRoute).toContain("CustomTopicRouteClient");
    expect(transition).toContain('searchParams.get("requestId")');
    expect(transition).toContain("/lesson/building/");
    expect(transition).toContain("router.replace");
  });

  it("renders the story in a lesson route with readiness on the right", () => {
    expect(buildingRoute).toContain("ProgressiveStoryPage");
    expect(progressive).toContain("Read the real lesson now");
    expect(progressive).toContain("Lesson readiness");
    expect(progressive).toContain("lg:grid-cols-[minmax(0,1fr)_320px]");
    expect(progressive).toContain("lg:sticky lg:top-6");
    expect(progressive).toContain("InspectableText");
  });

  it("polls background readiness and opens the completed lesson", () => {
    expect(progressive).toContain("/api/custom-lessons/status?requestId=");
    expect(progressive).toContain("2_500");
    expect(progressive).toContain("completedGroups");
    expect(progressive).toContain("/lesson/${result.lessonId}/play");
    expect(progressive).toContain("Continue full lesson");
  });
});
