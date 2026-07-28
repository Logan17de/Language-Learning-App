"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const audioUrlCache = new Map<string, Promise<string>>();

function audioRequestKey(text?: string, audioAssetId?: string): string {
  if (audioAssetId?.trim()) return `asset:${audioAssetId.trim()}`;
  return `text:${text?.normalize("NFKC").trim() ?? ""}`;
}

function requestAudioUrl(text?: string, audioAssetId?: string): Promise<string> {
  const key = audioRequestKey(text, audioAssetId);
  const cached = audioUrlCache.get(key);
  if (cached) return cached;

  const pending = fetch("/api/audio/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, audioAssetId }),
  })
    .then(async (response) => {
      const result: unknown = await response.json().catch(() => null);
      const url =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>).url
          : null;
      if (!response.ok || typeof url !== "string") {
        throw new Error("Audio is unavailable.");
      }
      return url;
    })
    .catch((error) => {
      audioUrlCache.delete(key);
      throw error;
    });

  audioUrlCache.set(key, pending);
  return pending;
}

function createPreloadedAudio(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.preload = "auto";

    const cleanup = () => {
      audio.removeEventListener("canplay", handleReady);
      audio.removeEventListener("canplaythrough", handleReady);
      audio.removeEventListener("error", handleError);
    };
    const handleReady = () => {
      cleanup();
      resolve(audio);
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Audio could not be loaded."));
    };

    audio.addEventListener("canplay", handleReady, { once: true });
    audio.addEventListener("canplaythrough", handleReady, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    audio.load();

    if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      handleReady();
    }
  });
}

export function AudioControl({
  replayCount,
  onPlay,
  text,
  audioAssetId,
  label = "Play audio",
  large = false,
}: {
  replayCount: number;
  onPlay: () => void;
  text?: string;
  audioAssetId?: string;
  label?: string;
  large?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadRef = useRef<Promise<HTMLAudioElement> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    setReady(false);
    setPlaying(false);
    audioRef.current?.pause();
    audioRef.current = null;

    const preload = requestAudioUrl(text, audioAssetId)
      .then(createPreloadedAudio)
      .then((audio) => {
        audio.onended = () => setPlaying(false);
        audio.onerror = () => {
          setPlaying(false);
          setReady(false);
          setError("Audio could not be played.");
        };
        if (!active) {
          audio.pause();
          audio.src = "";
          return audio;
        }
        audioRef.current = audio;
        setReady(true);
        return audio;
      })
      .catch(() => {
        if (active) {
          setReady(false);
          setError("Audio could not be prepared.");
        }
        throw new Error("Audio preload failed.");
      });

    preloadRef.current = preload;

    return () => {
      active = false;
      audioRef.current?.pause();
      audioRef.current = null;
      preloadRef.current = null;
    };
  }, [audioAssetId, text]);

  async function play() {
    setError("");
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    onPlay();
    setLoading(true);
    try {
      const audio = audioRef.current ?? (await preloadRef.current);
      if (!audio) throw new Error("Audio is unavailable.");
      audio.currentTime = 0;
      await audio.play();
      setPlaying(true);
      setReady(true);
    } catch {
      setError("Audio could not be played.");
      setPlaying(false);
      setReady(false);
    } finally {
      setLoading(false);
    }
  }

  const preparing = loading || (!ready && !error);

  return (
    <div>
      <Button
        type="button"
        onClick={play}
        disabled={loading || Boolean(error)}
        variant={large ? "dark" : "secondary"}
        className={cn(large && "min-h-24 w-full rounded-3xl text-base")}
        aria-label={playing ? "Pause audio" : label}
      >
        {preparing ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : playing ? (
          <Pause className="size-5" />
        ) : replayCount > 0 ? (
          <RotateCcw className="size-5" />
        ) : (
          <Play className="size-5" />
        )}
        {preparing
          ? "Loading audio…"
          : playing
            ? "Playing…"
            : replayCount > 0
              ? `Replay audio · ${replayCount}`
              : label}
        {large && <Volume2 className={cn("ml-2 size-5", playing && "animate-pulse")} />}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
