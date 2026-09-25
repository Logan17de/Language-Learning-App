"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const audioUrlCache = new Map<string, Promise<string>>();
const preloadedAudioCache = new Map<string, Promise<HTMLAudioElement>>();

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

/**
 * A media element that never becomes playable must be torn down, not just
 * abandoned.
 *
 * Chrome caps how many media players a renderer may hold. An element left
 * loading keeps its slot forever, and the renderer outlives the page: it is
 * shared across same-site navigations and tabs. So every abandoned element is
 * permanent. Once enough pile up the cap is reached and *every* later load in
 * that renderer stalls at readyState 0 - including audio that had worked
 * moments before, and including a local data: URI that touches no network. The
 * page then looks broken in a way reloading cannot fix, because the reload
 * lands in the same exhausted renderer.
 *
 * That is what made this fail. The old code resolved on canplay and rejected
 * on error, but a stalled element fires neither, so the promise never settled,
 * the control sat on "Loading audio..." with the answers locked, and the
 * element was never released. Each visit leaked a few more until nothing could
 * play at all.
 *
 * So a load that misses its deadline is aborted explicitly - clear the source
 * and re-load, which frees the player - and its cache entry is dropped so a
 * retry starts clean.
 */
const AUDIO_LOAD_TIMEOUT_MS = 12_000;

/** Free a media element's decoder slot. Without this the slot leaks. */
function releaseAudio(audio: HTMLAudioElement) {
  try {
    audio.pause();
    audio.removeAttribute("src");
    audio.srcObject = null;
    audio.load();
  } catch {
    // An element already torn down by the browser is fine to ignore.
  }
}

function createPreloadedAudio(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.preload = "auto";

    const timer = setTimeout(() => {
      cleanup();
      releaseAudio(audio);
      reject(new Error("Audio could not be loaded."));
    }, AUDIO_LOAD_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
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
      releaseAudio(audio);
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

/**
 * Successful loads are kept so replaying a clip is instant, but they cannot be
 * kept forever: a retained element holds a player slot just as a stalled one
 * does, and the renderer survives navigation, so a learner working through
 * several lessons would drift toward the same cap. Hold the few clips in play
 * and release the rest. A clip that is still sounding is left alone and
 * reconsidered on the next insertion.
 */
const MAX_CACHED_AUDIO = 8;

function evictStaleAudio() {
  for (const key of preloadedAudioCache.keys()) {
    if (preloadedAudioCache.size <= MAX_CACHED_AUDIO) return;
    const entry = preloadedAudioCache.get(key);
    if (!entry) continue;
    void entry.then((audio) => {
      if (!audio.paused) return;
      preloadedAudioCache.delete(key);
      releaseAudio(audio);
    }, () => undefined);
  }
}

function requestPreloadedAudio(
  text?: string,
  audioAssetId?: string,
): Promise<HTMLAudioElement> {
  const key = audioRequestKey(text, audioAssetId);
  const cached = preloadedAudioCache.get(key);
  if (cached) return cached;

  const pending = requestAudioUrl(text, audioAssetId)
    .then(createPreloadedAudio)
    .catch((error) => {
      preloadedAudioCache.delete(key);
      throw error;
    });
  preloadedAudioCache.set(key, pending);
  evictStaleAudio();
  return pending;
}

export function preloadListeningAudio({
  text,
  audioAssetId,
  browserTts = false,
}: {
  text?: string;
  audioAssetId?: string;
  browserTts?: boolean;
}): Promise<HTMLAudioElement | null> {
  if (browserTts || (!audioAssetId?.trim() && !text?.trim())) {
    return Promise.resolve(null);
  }
  return requestPreloadedAudio(text, audioAssetId);
}

export function AudioControl({
  replayCount,
  onPlay,
  onEnded,
  text,
  audioAssetId,
  browserTts = false,
  label = "Play audio",
  large = false,
}: {
  replayCount: number;
  onPlay: () => void;
  onEnded?: () => void;
  text?: string;
  audioAssetId?: string;
  browserTts?: boolean;
  label?: string;
  large?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const preloadRef = useRef<Promise<HTMLAudioElement | null> | null>(null);
  const onEndedRef = useRef(onEnded);
  const [playing, setPlaying] = useState(false);
  const [browserPlayingText, setBrowserPlayingText] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  // Reading uses microphone + STT only. The legacy reading component still
  // renders this control, so block it before any TTS request or preload occurs.
  const readingSttOnly = label === "Hear this line";
  const browserSpeechReady =
    browserTts &&
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined" &&
    Boolean(text?.trim());
  const browserPlaying = browserSpeechReady && browserPlayingText === text && playing;

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (browserTts) {
      audioRef.current?.pause();
      audioRef.current = null;
      preloadRef.current = null;
      return () => {
        window.speechSynthesis?.cancel();
        utteranceRef.current = null;
      };
    }
    if (readingSttOnly) {
      audioRef.current?.pause();
      audioRef.current = null;
      preloadRef.current = null;
      return;
    }

    let active = true;
    /* eslint-disable react-hooks/set-state-in-effect -- reset the prior audio source before starting an asynchronous preload */
    setError("");
    setReady(false);
    setPlaying(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    audioRef.current?.pause();
    audioRef.current = null;

    const preload = requestPreloadedAudio(text, audioAssetId)
      .then((audio) => {
        audio.onended = () => {
          setPlaying(false);
          onEndedRef.current?.();
        };
        audio.onerror = () => {
          setPlaying(false);
          setReady(false);
          setError("Audio could not be played.");
        };
        if (!active) {
          audio.pause();
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
        return null;
      });

    preloadRef.current = preload;

    return () => {
      active = false;
      audioRef.current?.pause();
      audioRef.current = null;
      preloadRef.current = null;
    };
  }, [audioAssetId, browserTts, readingSttOnly, text]);

  async function play() {
    setError("");
    if (browserTts) {
      if (browserPlaying) {
        window.speechSynthesis.cancel();
        utteranceRef.current = null;
        setBrowserPlayingText("");
        setPlaying(false);
        return;
      }
      const spokenText = text?.normalize("NFKC").trim() ?? "";
      if (!spokenText || !browserSpeechReady) {
        setError("Japanese browser speech is unavailable.");
        return;
      }
      onPlay();
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = "ja-JP";
      utterance.rate = 0.9;
      const japaneseVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.toLocaleLowerCase().startsWith("ja"));
      if (japaneseVoice) utterance.voice = japaneseVoice;
      utterance.onend = () => {
        utteranceRef.current = null;
        setBrowserPlayingText("");
        setPlaying(false);
        onEndedRef.current?.();
      };
      utterance.onerror = () => {
        utteranceRef.current = null;
        setBrowserPlayingText("");
        setPlaying(false);
        setError("Japanese browser speech could not be played.");
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      setBrowserPlayingText(text ?? "");
      setPlaying(true);
      return;
    }
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
      // The reusable HTMLAudioElement is intentionally rewound for replay.
      // eslint-disable-next-line react-hooks/immutability
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

  if (readingSttOnly) return null;

  const visibleError = browserTts && !browserSpeechReady
    ? "Japanese browser speech is unavailable."
    : error;
  const visiblePlaying = browserTts ? browserPlaying : playing;
  const preparing = !browserTts && (loading || (!ready && !visibleError));

  return (
    <div>
      <Button
        type="button"
        onClick={play}
        disabled={loading || Boolean(visibleError)}
        variant={large ? "dark" : "secondary"}
        className={cn(large && "min-h-24 w-full rounded-3xl text-base")}
        aria-label={visiblePlaying ? "Pause audio" : label}
      >
        {preparing ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : visiblePlaying ? (
          <Pause className="size-5" />
        ) : replayCount > 0 ? (
          <RotateCcw className="size-5" />
        ) : (
          <Play className="size-5" />
        )}
        {preparing
          ? "Loading audio…"
          : visiblePlaying
            ? "Playing…"
            : replayCount > 0
              ? `Replay audio · ${replayCount}`
              : label}
        {large && (
          <Volume2 className={cn("ml-2 size-5", visiblePlaying && "animate-pulse")} />
        )}
      </Button>
      {visibleError && (
        <p
          role="alert"
          className="mt-2 text-center text-xs font-semibold text-red-600"
        >
          {visibleError}
        </p>
      )}
    </div>
  );
}
