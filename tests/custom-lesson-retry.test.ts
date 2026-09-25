import { describe, expect, it } from "vitest";
import { customLessonRetryAction } from "@/lib/custom-lesson-retry";

describe("custom lesson retry behavior", () => {
  it("retries failed activity generation before the lesson is ready", () => {
    expect(customLessonRetryAction({
      retrying: false,
      lessonReady: false,
      audioStatus: "pending",
      permanentFailure: false,
      retryableFailure: true,
      failedGroupCount: 0,
    })).toBe("activities");

    expect(customLessonRetryAction({
      retrying: false,
      lessonReady: false,
      audioStatus: "pending",
      permanentFailure: false,
      retryableFailure: false,
      failedGroupCount: 1,
    })).toBe("activities");
  });

  it("retries only audio once the playable lesson exists", () => {
    expect(customLessonRetryAction({
      retrying: false,
      lessonReady: true,
      audioStatus: "failed",
      permanentFailure: false,
      retryableFailure: true,
      failedGroupCount: 1,
    })).toBe("audio");
  });

  it("does not retry permanent failures or duplicate an in-flight retry", () => {
    expect(customLessonRetryAction({
      retrying: false,
      lessonReady: false,
      audioStatus: "pending",
      permanentFailure: true,
      retryableFailure: true,
      failedGroupCount: 1,
    })).toBeNull();

    expect(customLessonRetryAction({
      retrying: true,
      lessonReady: false,
      audioStatus: "pending",
      permanentFailure: false,
      retryableFailure: true,
      failedGroupCount: 1,
    })).toBeNull();
  });
});
