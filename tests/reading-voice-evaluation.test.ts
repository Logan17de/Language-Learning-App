import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reading = readFileSync("components/lesson/reading-phase.tsx", "utf8");
const sessionTypes = readFileSync("types/lesson-session.ts", "utf8");

describe("reading voice evaluation contract", () => {
  it("records and transcribes before completing the reading phase", () => {
    expect(reading).toContain("navigator.mediaDevices.getUserMedia({ audio: true })");
    expect(reading).toContain("new MediaRecorder");
    expect(reading).toContain('fetch("/api/audio/transcribe"');
    expect(reading).toContain('type: "voice-evaluation"');
    expect(reading).toContain("speechMatch");
    expect(reading).toContain("readingComplete: true");
    expect(reading.indexOf('fetch("/api/audio/transcribe"')).toBeLessThan(
      reading.indexOf("readingComplete: true"),
    );
  });

  it("does not create confidence from timer position alone", () => {
    expect(reading).not.toContain("Timer only · no recording");
    expect(reading).not.toContain("createStopEvent");
    expect(reading).not.toContain("Medium confidence");
    expect(reading).not.toContain("Retry marked phrase");
    expect(reading).toContain("Nothing was scored. Try again.");
    expect(reading).toContain("No reading result is created without a recording.");
  });

  it("labels transcription comparison without claiming pronunciation scoring", () => {
    expect(sessionTypes).toContain('| "voice-evaluation"');
    expect(sessionTypes).toContain("speechMatch?: number");
    expect(sessionTypes).toContain("transcript?: string");
    expect(reading).toContain("Speech match");
    expect(reading).toContain("It is not phoneme-level pronunciation scoring.");
  });
});
