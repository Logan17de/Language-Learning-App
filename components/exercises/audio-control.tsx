"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AudioControl({
  replayCount,
  onPlay,
  label = "Play audio",
  large = false,
}: {
  replayCount: number;
  onPlay: () => void;
  label?: string;
  large?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timeout = window.setTimeout(() => setPlaying(false), 2400);
    return () => window.clearTimeout(timeout);
  }, [playing]);

  function play() {
    setPlaying(true);
    onPlay();
  }

  return (
    <Button
      type="button"
      onClick={play}
      variant={large ? "dark" : "secondary"}
      className={cn(large && "min-h-24 w-full rounded-3xl text-base")}
      aria-label={playing ? "Audio simulation playing" : label}
    >
      {playing ? <Pause className="size-5" /> : replayCount > 0 ? <RotateCcw className="size-5" /> : <Play className="size-5" />}
      {playing ? "Playing…" : replayCount > 0 ? `Replay audio · ${replayCount}` : label}
      {large && <Volume2 className={cn("ml-2 size-5", playing && "animate-pulse")} />}
    </Button>
  );
}
