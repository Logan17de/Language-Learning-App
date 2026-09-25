export type CustomLessonRetryAction = "audio" | "activities" | null;

export function customLessonRetryAction(input: {
  retrying: boolean;
  lessonReady: boolean;
  audioStatus: string;
  permanentFailure: boolean;
  retryableFailure: boolean;
  failedGroupCount: number;
}): CustomLessonRetryAction {
  if (input.retrying) return null;
  if (input.lessonReady && input.audioStatus === "failed") return "audio";
  if (
    !input.lessonReady &&
    !input.permanentFailure &&
    (input.retryableFailure || input.failedGroupCount > 0)
  ) {
    return "activities";
  }
  return null;
}
