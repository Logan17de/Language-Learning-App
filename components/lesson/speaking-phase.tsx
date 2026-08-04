"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, Mic2, RotateCcw, Square } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, SpeakingEvent } from "@/types/lesson-session";
import { AudioControl } from "@/components/exercises/audio-control";
import { SpeakingFeedback } from "@/components/exercises/speaking-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { appendInspectableInteraction } from "@/lib/lesson-support";

export function SpeakingPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const exercises = lesson.speakingExercises;
  const completedIds = new Set(
    session.speakingEvents.map((event) => event.exerciseId).filter(Boolean),
  );
  const currentIndex = Math.min(session.activityIndex, exercises.length - 1);
  const exercise = exercises[currentIndex];
  const exerciseEvents = session.speakingEvents.filter(
    (event) => event.exerciseId === exercise.id,
  );
  const [speaking, setSpeaking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const latest = exerciseEvents.at(-1);

  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function startRecording() {
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
        void evaluateRecording(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setSpeaking(true);
    } catch {
      setError("AIko could not access your microphone. Check browser permission and try again.");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setSpeaking(false);
    recorder.stop();
  }

  async function evaluateRecording(audio: Blob) {
    setTranscribing(true);
    const attempt = exerciseEvents.length + 1;
    const retry = attempt > 1;
    const expected = exercise.modelAnswer;
    let event: SpeakingEvent;
    try {
      const form = new FormData();
      form.append("audio", audio, "aiko-speaking.webm");
      form.append("expected", expected);
      const response = await fetch("/api/audio/transcribe", {
        method: "POST",
        body: form,
      });
      const result: unknown = await response.json().catch(() => null);
      const transcript =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>).transcript
          : null;
      if (!response.ok || typeof transcript !== "string") {
        throw new Error("Speech recognition failed.");
      }
      const targets = unique(
        (exercise.inspectableTerms ?? []).flatMap((item) => [item.surface, item.reading]),
      );
      const recognizedWords = targets.filter((item) => normalized(transcript).includes(normalized(item)));
      const missedWords = targets.filter((item) => !recognizedWords.includes(item));
      const sentenceMatch = similarity(transcript, expected);
      event = {
        id: `speaking_${exercise.id}_${attempt}`,
        exerciseId: exercise.id,
        mode: exercise.mode,
        attempt,
        evaluationAvailable: true,
        pronunciationConfidence: sentenceMatch,
        grammarAccuracy: sentenceMatch,
        transcript,
        recognizedWords,
        missedWords,
        successfulRetry: retry && sentenceMatch >= 70,
      };
    } catch {
      setError("The recording was saved, but speech recognition failed. You can retry.");
      event = {
        id: `speaking_${exercise.id}_${attempt}`,
        exerciseId: exercise.id,
        mode: exercise.mode,
        attempt,
        evaluationAvailable: false,
        pronunciationConfidence: 0,
        grammarAccuracy: 0,
        recognizedWords: [],
        missedWords: [],
        successfulRetry: false,
      };
    } finally {
      setTranscribing(false);
    }

    const completedAfter = new Set([...completedIds, exercise.id]);
    onChange({
      ...session,
      activityIndex: currentIndex,
      speakingEvents: [...session.speakingEvents, event],
      speakingComplete: exercises.every((item) => completedAfter.has(item.id)),
    });
  }

  function nextExercise() {
    if (!latest || currentIndex >= exercises.length - 1) return;
    setSpeaking(false);
    setError("");
    onChange({ ...session, activityIndex: currentIndex + 1 });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <div className="flex justify-center gap-2">
          <Badge tone="orange">Read aloud</Badge>
          <Badge>{exercise.mode}</Badge>
        </div>
        <h2 className="mt-4 text-3xl font-semibold">Read the sentence aloud.</h2>
        <p className="mt-3 text-stone-500">Speak the Japanese sentence exactly as it appears. AIko will transcribe your reading and compare it with the displayed text.</p>
        <p className="mt-3 text-sm font-semibold text-stone-400">{currentIndex + 1} / {exercises.length}</p>
      </div>
      <ProgressBar value={(completedIds.size / exercises.length) * 100} className="mt-6" />
      <Card className="mt-7 p-6 sm:p-8">
        <div className="min-h-28 rounded-3xl bg-moss-50 p-6 text-center">
          <p className="font-serif text-2xl leading-10">
            <InspectableText
              text={exercise.modelAnswer}
              terms={exercise.inspectableTerms ?? []}
              onReveal={(word, reveal) =>
                onChange(appendInspectableInteraction(session, exercise.id, word, reveal))
              }
            />
          </p>
        </div>

        <div className="mt-5">
          <AudioControl key={exercise.id} replayCount={0} onPlay={() => undefined} text={exercise.modelAnswer} audioAssetId={exercise.audioAssetId} browserTts={lesson.runtimeAudio === "browser_tts"} label="Hear the sentence" />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!speaking ? (
            <Button type="button" disabled={transcribing} onClick={startRecording}>
              {transcribing ? <LoaderCircle className="size-4 animate-spin" /> : <Mic2 className="size-4" />}
              {transcribing ? "Checking speech…" : "Start recording"}
            </Button>
          ) : (
            <Button type="button" onClick={stopRecording} className="bg-persimmon-500 hover:bg-persimmon-600"><Square className="size-4 fill-current" /> Stop and check</Button>
          )}
        </div>
        {speaking && (
          <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl bg-persimmon-50 p-4 text-sm font-semibold text-persimmon-600" role="status">
            <span className="size-3 animate-pulse rounded-full bg-persimmon-500" /> Recording… read clearly, then tap Stop and check
          </div>
        )}
        {error && <p role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
        {latest && (
          <div className="mt-7">
            <SpeakingFeedback event={latest} targetSentence={exercise.modelAnswer} />
            <Button type="button" variant="secondary" className="mt-4" disabled={speaking || transcribing} onClick={startRecording}><RotateCcw className="size-4" /> Try Again</Button>
            {currentIndex < exercises.length - 1 && (
              <Button type="button" className="mt-4 sm:ml-3" disabled={speaking || transcribing} onClick={nextExercise}>
                Next sentence <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s、。！？,.!?・「」『』（）()]/g, "");
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
  return Math.max(0, Math.round((1 - rows[left.length] / Math.max(left.length, right.length)) * 100));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
