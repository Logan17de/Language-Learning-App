import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const speaking = readFileSync("components/lesson/speaking-phase.tsx", "utf8");
const feedback = readFileSync("components/exercises/speaking-feedback.tsx", "utf8");
const transcriptionRoute = readFileSync("app/api/audio/transcribe/route.ts", "utf8");
const audioLibrary = readFileSync("lib/audio/audio-library.ts", "utf8");

describe("live speaking transcription", () => {
  it("streams interim transcripts for at most twenty seconds", () => {
    expect(speaking).toContain("RECORDING_LIMIT_SECONDS = 20");
    expect(speaking).toContain("LIVE_TRANSCRIPTION_INTERVAL_MS = 2_000");
    expect(speaking).toContain("void updateLiveTranscript");
    expect(speaking).toContain("Your words will appear here.");
    expect(speaking).toContain("window.setTimeout(stopRecording");
    expect(speaking).toContain("Show reading");
    expect(speaking).toContain("pronunciationConfidence >= 70");
  });

  it("does not save silence or failed transcription as a completed attempt", () => {
    expect(speaking).toContain("if (!heardVoice)");
    expect(speaking).toContain("No speech was detected");
    expect(speaking).not.toContain("evaluationAvailable: false");
    expect(transcriptionRoute).not.toContain('input?.get("expected")');
    expect(transcriptionRoute).toContain("If there is no intelligible speech");
    expect(transcriptionRoute).toContain("status: 422");
  });

  it("shows only the transcript and sentence-match result", () => {
    expect(feedback).toContain("AIko heard");
    expect(feedback).toContain("Sentence match");
    expect(feedback).not.toContain("Recognized lesson words");
    expect(feedback).not.toContain("Missed or uncertain");
    expect(feedback).not.toContain("Target sentence");
    expect(speaking).not.toContain("AudioControl");
    expect(audioLibrary).not.toContain('.from("lesson_speaking_activities")');
    expect(audioLibrary).toContain('.from("lesson_listening_activities")');
  });
});
