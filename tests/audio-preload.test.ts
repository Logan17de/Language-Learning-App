import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/exercises/audio-control.tsx", "utf8");
const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");

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

  it("starts preloading listening-only audio when the lesson player mounts", () => {
    expect(source).toContain("export function preloadListeningAudio");
    expect(player).toContain("for (const exercise of lesson.listeningExercises)");
    expect(player).toContain("void preloadListeningAudio({");
    expect(player).toContain("text: exercise.transcript");
    expect(player).not.toContain("lesson.speakingExercises) {\n      void preloadListeningAudio");
  });
});
