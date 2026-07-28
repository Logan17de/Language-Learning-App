"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock3,
  LoaderCircle,
  Mic2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Waves,
} from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, ReadingEvent } from "@/types/lesson-session";
import { createReadingEvent } from "@/lib/reading-event-utils";
import { AudioControl } from "@/components/exercises/audio-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ReadingPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const expectedPhrases = useMemo(
    () => lesson.readingConversation.map((line) => line.japanese).filter(Boolean),
    [lesson.readingConversation],
  );
  const expectedReading = useMemo(() => expectedPhrases.join("\n"), [expectedPhrases]);
  const supportItems = useMemo(() => readingSupportItems(lesson), [lesson]);
  const latestEvaluation = useMemo(
    () =>
      session.readingEvents.findLast(
        (event) => event.type === "voice-evaluation" && event.evaluationAvailable,
      ) ?? null,
    [session.readingEvents],
  );
  const sessionRef = useRef(session);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const secondsRef = useRef(latestEvaluation?.elapsedSeconds ?? 0);
  const [started, setStarted] = useState(Boolean(latestEvaluation));
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(latestEvaluation?.elapsedSeconds ?? 0);
  const [error, setError] = useState("");

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!active || paused) return;
    const timer = window.setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, paused]);

  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && (recorder.state === "recording" || recorder.state === "paused")) {
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function commitSession(next: LessonSession) {
    sessionRef.current = next;
    onChange(next);
  }

  async function startRecording() {
    if (active || transcribing) return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = "audio/webm;codecs=opus";
      const recorder = MediaRecorder.isTypeSupported(preferred)
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (blob.size === 0) {
          setTranscribing(false);
          setError("No audio was captured. Start the microphone and try again.");
          return;
        }
        void evaluateRecording(blob);
      };
      recorderRef.current = recorder;
      secondsRef.current = 0;
      setSeconds(0);
      setStarted(true);
      setPaused(false);
      setTranscribing(false);
      recorder.start(250);
      setActive(true);

      const current = sessionRef.current;
      const attempt = current.readingEvents.filter((event) => event.type === "started").length;
      const startedEvent = createReadingEvent(
        "started",
        "reading-session",
        0,
        attempt,
      );
      commitSession({
        ...current,
        readingEvents: [...current.readingEvents, startedEvent],
        readingComplete: false,
      });
    } catch {
      setError("AIko could not access your microphone. Check browser permission and try again.");
    }
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setPaused(true);
      return;
    }
    if (recorder.state === "paused") {
      recorder.resume();
      setPaused(false);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || (recorder.state !== "recording" && recorder.state !== "paused")) {
      return;
    }
    setActive(false);
    setPaused(false);
    setTranscribing(true);
    recorder.stop();
  }

  async function evaluateRecording(audio: Blob) {
    try {
      const form = new FormData();
      form.append("audio", audio, "aiko-reading.webm");
      form.append("expected", expectedReading);
      const response = await fetch("/api/audio/transcribe", {
        method: "POST",
        body: form,
      });
      const result: unknown = await response.json().catch(() => null);
      const transcript =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>).transcript
          : null;
      if (!response.ok || typeof transcript !== "string" || !transcript.trim()) {
        throw new Error("Speech recognition failed.");
      }

      const recognized = supportItems.map((item) => ({
        item,
        matched: transcriptContains(transcript, item.term, item.reading),
      }));
      const overallMatch = similarity(transcript, expectedReading);
      const supportMatch = recognized.length
        ? Math.round((recognized.filter((item) => item.matched).length / recognized.length) * 100)
        : overallMatch;
      const speechMatch = Math.round(overallMatch * 0.75 + supportMatch * 0.25);
      const current = sessionRef.current;
      const attempt = current.readingEvents.filter(
        (event) => event.type === "voice-evaluation",
      ).length + 1;
      const elapsed = secondsRef.current;
      const evaluation: ReadingEvent = {
        id: `voice-evaluation_reading-session_${elapsed}_${attempt}`,
        type: "voice-evaluation",
        term: "reading-session",
        confidence: speechMatch >= 85 ? "high" : speechMatch >= 60 ? "medium" : "low",
        elapsedSeconds: elapsed,
        evaluationAvailable: true,
        speechMatch,
        transcript: transcript.trim(),
      };
      const wordEvents = recognized.map(({ item, matched }, index) =>
        createReadingEvent(
          matched ? "correct-word" : "pronunciation-issue",
          item.term,
          elapsed,
          attempt * 100 + index,
        ),
      );
      commitSession({
        ...current,
        readingEvents: [...current.readingEvents, evaluation, ...wordEvents],
        readingComplete: true,
      });
    } catch {
      setError(
        "The recording was captured, but speech recognition failed. Nothing was scored. Try again.",
      );
      const current = sessionRef.current;
      commitSession({ ...current, readingComplete: false });
    } finally {
      setTranscribing(false);
    }
  }

  function reveal(term: ReadingSupportItem) {
    const current = sessionRef.current;
    const count = current.readingEvents.filter(
      (event) =>
        event.term === term.term &&
        (event.type === "reading-revealed" || event.type === "meaning-revealed"),
    ).length;
    const type =
      term.hasKanji && count === 0 ? "reading-revealed" : "meaning-revealed";
    const event = createReadingEvent(type, term.term, secondsRef.current, count);
    commitSession({
      ...current,
      readingEvents: [...current.readingEvents, event],
    });
  }

  const revealed = useMemo(() => {
    const map = new Map<string, number>();
    session.readingEvents
      .filter((event) => event.type === "reading-revealed" || event.type === "meaning-revealed")
      .forEach((event) => map.set(event.term, (map.get(event.term) ?? 0) + 1));
    return map;
  }, [session.readingEvents]);

  if (!started && !transcribing) {
    const legacyTimerResult = session.readingComplete && !latestEvaluation;
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <span className="mx-auto grid size-24 place-items-center rounded-4xl bg-moss-900 text-white shadow-float"><Mic2 className="size-10" /></span>
        <Badge className="mt-8">Read-aloud practice</Badge>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">Read when you’re ready.</h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-500">
          Press Start microphone, allow browser access, and read the saved passage aloud. AIko checks the transcription only after you stop.
        </p>
        <div className="mx-auto mt-7 max-w-lg rounded-2xl bg-persimmon-50 p-4 text-sm text-persimmon-700">
          {legacyTimerResult
            ? "Your earlier timer-only result will not be used. Record your voice to complete this reading check."
            : "The passage stays hidden until the microphone starts. No reading result is created without a recording."}
        </div>
        {error && <p role="alert" className="mx-auto mt-5 max-w-lg rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
        <Button type="button" onClick={startRecording} className="mt-8 min-h-16 px-10 text-base"><Mic2 className="size-5" /> Start microphone</Button>
      </div>
    );
  }

  if (session.readingComplete && latestEvaluation && !active && !transcribing) {
    const evaluationIndex = session.readingEvents.findIndex(
      (event) => event.id === latestEvaluation.id,
    );
    const latestWordEvents = session.readingEvents
      .slice(evaluationIndex + 1)
      .filter((event) => event.type === "correct-word" || event.type === "pronunciation-issue");
    const difficultTerms = unique(
      latestWordEvents
        .filter((event) => event.type === "pronunciation-issue")
        .map((event) => event.term),
    );
    return (
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-4xl bg-moss-100 text-moss-700"><Check className="size-9" /></span>
          <h2 className="mt-6 text-3xl font-semibold">Reading complete</h2>
          <p className="mt-2 text-stone-500">{latestEvaluation.elapsedSeconds} seconds · voice checked</p>
        </div>
        <Card className="mt-8 p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">Words to review</h3>
            <Badge tone="orange">Speech match {latestEvaluation.speechMatch ?? 0}%</Badge>
          </div>
          {difficultTerms.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {difficultTerms.map((term) => {
                const support = supportItems.find((item) => item.term === term);
                return (
                  <div key={term} className="rounded-2xl bg-persimmon-50 p-4">
                    <p className="font-serif text-2xl font-semibold">{term}</p>
                    {support && (
                      <p className="mt-1 text-xs text-stone-500">
                        {support.reading} · {support.meaning}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-moss-50 p-4 text-sm text-moss-800">
              All tracked lesson words appeared in the recognized reading.
            </p>
          )}
          <div className="mt-5 rounded-2xl bg-moss-50 p-4 text-sm leading-6 text-moss-900">
            This percentage compares the speech transcript with the saved Japanese passage. It is not phoneme-level pronunciation scoring.
          </div>
          {latestEvaluation.transcript && (
            <div className="mt-5 rounded-2xl bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">AIko heard</p>
              <p className="mt-2 font-serif text-lg leading-8">{latestEvaluation.transcript}</p>
            </div>
          )}
          <Button type="button" variant="secondary" onClick={startRecording} className="mt-5">
            <RotateCcw className="size-4" /> Read again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><Badge tone="orange">Reading aloud</Badge><h2 className="mt-3 text-3xl font-semibold">{lesson.japaneseTitle}</h2></div>
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm">
          <Clock3 className="size-4 text-moss-600" /> {formatTime(seconds)}
          <span className={cn("ml-1 size-2 rounded-full", active && !paused ? "animate-pulse bg-persimmon-500" : "bg-stone-300")} />
        </div>
      </div>

      <Card className="mt-7 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-moss-900 p-4 text-white">
          <div className="flex items-center gap-3">
            {transcribing ? <LoaderCircle className="size-5 animate-spin" /> : <Waves className={cn("size-5", active && !paused && "animate-pulse")} />}
            <span className="text-sm font-semibold">
              {transcribing
                ? "Checking your recording…"
                : paused
                  ? "Recording paused"
                  : active
                    ? "Microphone recording your reading…"
                    : "Ready to record your reading"}
            </span>
          </div>
          <span className="text-xs text-white/60">Microphone + speech recognition</span>
        </div>
        <div className="space-y-5 p-6 sm:p-8">
          {lesson.readingConversation.map((line, lineIndex) => (
            <div key={`${line.speaker}-${lineIndex}`} className="grid gap-3 sm:grid-cols-[5rem_1fr]">
              <p className="text-sm font-semibold text-moss-700">{line.speaker}</p>
              <div>
                <p className="font-serif text-xl leading-9">{line.japanese}</p>
                <div className="mt-2">
                  <AudioControl
                    replayCount={0}
                    onPlay={() => undefined}
                    text={line.japanese}
                    audioAssetId={line.audioAssetId}
                    label="Hear this line"
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-5">
            {supportItems.map((support) => {
              const count = revealed.get(support.term) ?? 0;
              return (
                <button key={support.term} type="button" onClick={() => reveal(support)} className="min-h-11 rounded-xl bg-moss-50 px-4 text-sm focus:outline-none focus:ring-4 focus:ring-moss-100">
                  <span className="font-semibold">{support.term}</span>
                  {support.hasKanji && count >= 1 && <span className="ml-2 text-moss-600">{support.reading}</span>}
                  {count >= (support.hasKanji ? 2 : 1) && <span className="ml-2 text-stone-500">· {support.meaning}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {error && <p role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        {active ? (
          <>
            <Button type="button" variant="secondary" onClick={togglePause}>
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />} {paused ? "Resume recording" : "Pause recording"}
            </Button>
            <Button type="button" onClick={stopRecording} className="bg-persimmon-500 hover:bg-persimmon-600"><Square className="size-4 fill-current" /> Stop and check</Button>
          </>
        ) : (
          <Button type="button" disabled={transcribing} onClick={startRecording}>
            {transcribing ? <LoaderCircle className="size-4 animate-spin" /> : <Mic2 className="size-4" />}
            {transcribing ? "Checking reading…" : "Start microphone"}
          </Button>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

interface ReadingSupportItem {
  term: string;
  reading: string;
  meaning: string;
  hasKanji: boolean;
}

function readingSupportItems(lesson: LessonPackage): ReadingSupportItem[] {
  const passage = lesson.readingConversation.map((line) => line.japanese).join("");
  const candidates = [
    ...lesson.vocabulary.map((item) => ({
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
    })),
    ...lesson.kanji.map((item) => ({
      term: item.character,
      reading: item.reading,
      meaning: item.meaning,
    })),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((item) => item.term && passage.includes(item.term))
    .filter((item) => {
      if (seen.has(item.term)) return false;
      seen.add(item.term);
      return true;
    })
    .map((item) => ({
      ...item,
      hasKanji: /[\u3400-\u9fff]/u.test(item.term),
    }))
    .slice(0, 8);
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s、。！？,.!?・「」『』（）()]/g, "");
}

function transcriptContains(transcript: string, term: string, reading: string): boolean {
  const source = normalized(transcript);
  return [term, reading]
    .map(normalized)
    .filter(Boolean)
    .some((candidate) => source.includes(candidate));
}

function similarity(leftValue: string, rightValue: string): number {
  const left = normalized(leftValue);
  const right = normalized(rightValue);
  if (!left || !right) return 0;
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let column = 1; column <= right.length; column += 1) {
    let diagonal = rows[0];
    rows[0] = column;
    for (let row = 1; row <= left.length; row += 1) {
      const previous = rows[row];
      rows[row] = Math.min(
        rows[row] + 1,
        rows[row - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return Math.max(
    0,
    Math.round((1 - rows[left.length] / Math.max(left.length, right.length)) * 100),
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
