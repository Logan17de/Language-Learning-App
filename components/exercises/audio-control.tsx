"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

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
      let audio = audioRef.current;
      if (!audio) {
        const response = await fetch("/api/audio/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, audioAssetId }),
        });
        const result: unknown = await response.json().catch(() => null);
        const url =
          result && typeof result === "object" && !Array.isArray(result)
            ? (result as Record<string, unknown>).url
            : null;
        if (!response.ok || typeof url !== "string") {
          throw new Error("Audio is unavailable.");
        }
        audio = new Audio(url);
        audio.preload = "auto";
        audio.onended = () => setPlaying(false);
        audio.onerror = () => {
          setPlaying(false);
          setError("Audio could not be played.");
        };
        audioRef.current = audio;
      }
      await audio.play();
      setPlaying(true);
    } catch {
      setError("Audio could not be played.");
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        onClick={play}
        disabled={loading}
        variant={large ? "dark" : "secondary"}
        className={cn(large && "min-h-24 w-full rounded-3xl text-base")}
        aria-label={playing ? "Pause audio" : label}
      >
        {loading ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : playing ? (
          <Pause className="size-5" />
        ) : replayCount > 0 ? (
          <RotateCcw className="size-5" />
        ) : (
          <Play className="size-5" />
        )}
        {loading
          ? "Preparing audio…"
          : playing
            ? "Playing…"
            : replayCount > 0
              ? `Replay audio · ${replayCount}`
              : label}
        {large && <Volume2 className={cn("ml-2 size-5", playing && "animate-pulse")} />}
      </Button>
      {error && <p role="alert" className="mt-2 text-center text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
