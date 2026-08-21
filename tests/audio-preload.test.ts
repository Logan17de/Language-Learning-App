import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/exercises/audio-control.tsx", "utf8");
const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");
const listening = readFileSync("components/lesson/listening-phase.tsx", "utf8");

describe("listening audio preload contract", () => {
  it("requests and buffers audio when the control mounts", () => {
    const effectIndex = source.indexOf("useEffect(() => {");
    const requestIndex = source.indexOf("const preload = requestPreloadedAudio", effectIndex);
    const playIndex = source.indexOf("async function play()");

    expect(effectIndex).toBeGreaterThanOrEqual(0);
    expect(requestIndex).toBeGreaterThan(effectIndex);
    expect(requestIndex).toBeLessThan(playIndex);
    expect(source).toContain('audio.preload = "auto"');
    expect(source).toContain("audio.load()");
    expect(source).toContain('audio.addEventListener("canplay"');
  });

  it("caches signed audio URLs by stored asset id", () => {
    expect(source).toContain("const audioUrlCache = new Map<string, Promise<string>>()");
    expect(source).toContain('return `asset:${audioAssetId.trim()}`');
    expect(source).toContain("const cached = audioUrlCache.get(key)");
    expect(source).toContain("audioUrlCache.set(key, pending)");
  });

  it("reuses the preloaded audio object on play and replay", () => {
    expect(source).toContain("const audio = audioRef.current ?? (await preloadRef.current)");
    expect(source).toContain("audio.currentTime = 0");
    expect(source).not.toContain('fetch("/api/audio/tts", {\n          method');
  });

  it("gives up on audio that never becomes playable", () => {
    // Some environments leave a media element at readyState 0 forever without
    // ever firing error. Without a deadline the promise never settles, the
    // control stays on "Loading audio..." with the answers locked, and every
    // retry rejoins the same cached dead wait.
    expect(source).toContain("const AUDIO_LOAD_TIMEOUT_MS");
    expect(source).toContain("clearTimeout(timer)");
    expect(source).toContain("preloadedAudioCache.delete(key)");
  });

  it("warms the first listening clip before the learner reaches the phase", () => {
    expect(source).toContain("export function preloadListeningAudio");
    expect(player).toContain("void preloadListeningAudio({");
    expect(player).toContain("const first = lesson.listeningExercises[0]");
    expect(player).toContain("text: first.transcript");
    // Not all five at once: that would put five downloads in flight against
    // the lesson content the learner is still reading.
    expect(player).not.toContain("for (const exercise of lesson.listeningExercises)");
  });

  it("keeps exactly one listening clip ahead of the learner", () => {
    expect(listening).toContain("const nextExercise = exercises[currentIndex + 1]");
    expect(listening).toContain("void preloadListeningAudio({");
    expect(listening).toContain("text: nextExercise.transcript");
    expect(listening).toContain("audioAssetId: nextExercise.audioAssetId");
  });
});
