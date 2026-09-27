"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, Mic2, RotateCcw, Square } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, SpeakingEvent } from "@/types/lesson-session";
import { SpeakingFeedback } from "@/components/exercises/speaking-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { appendInspectableInteraction } from "@/lib/lesson-support";

const RECORDING_LIMIT_SECONDS = 10;
const LIVE_TRANSCRIPTION_INTERVAL_MS = 2_000;
const VOICE_RMS_THRESHOLD = 0.018;
const REQUIRED_VOICE_FRAMES = 6;

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
  const [secondsRemaining, setSecondsRemaining] = useState(RECORDING_LIMIT_SECONDS);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const liveTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const voiceDetectionAvailableRef = useRef(false);
  const voiceDetectedRef = useRef(false);
  const consecutiveVoiceFramesRef = useRef(0);
  const partialRequestInFlightRef = useRef(false);
  const transcriptRequestRef = useRef(0);
  const appliedTranscriptRef = useRef(0);
  const discardRecordingRef = useRef(false);
  const latest = exerciseEvents.at(-1);

  useEffect(
    () => () => {
      discardRecordingRef.current = true;
      clearRecordingTimers();
      stopVoiceDetection();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function startRecording() {
    setError("");
    setLiveTranscript("");
    setSecondsRemaining(RECORDING_LIMIT_SECONDS);
    transcriptRequestRef.current += 1;
    appliedTranscriptRef.current = transcriptRequestRef.current;
    discardRecordingRef.current = false;
    voiceDetectedRef.current = false;
    consecutiveVoiceFramesRef.current = 0;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Microphone recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      startVoiceDetection(stream);
      const preferred = "audio/webm;codecs=opus";
      const recorder = MediaRecorder.isTypeSupported(preferred)
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const heardVoice = !voiceDetectionAvailableRef.current || voiceDetectedRef.current;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        clearRecordingTimers();
        stopVoiceDetection();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (discardRecordingRef.current) return;
        if (!heardVoice) {
          setLiveTranscript("");
          setError("No speech was detected. Read the sentence aloud and try again.");
          return;
        }
        void evaluateRecording(blob);
      };
      recorderRef.current = recorder;
      recorder.start(500);
      setSpeaking(true);

      const startedAt = Date.now();
      countdownTimerRef.current = window.setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1_000);
        setSecondsRemaining(Math.max(0, RECORDING_LIMIT_SECONDS - elapsedSeconds));
      }, 250);
      liveTimerRef.current = window.setInterval(() => {
        void updateLiveTranscript(recorder.mimeType || "audio/webm");
      }, LIVE_TRANSCRIPTION_INTERVAL_MS);
      stopTimerRef.current = window.setTimeout(stopRecording, RECORDING_LIMIT_SECONDS * 1_000);
    } catch {
      stopVoiceDetection();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError("AIko could not access your microphone. Check browser permission and try again.");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setSpeaking(false);
    clearRecordingTimers();
    recorder.requestData();
    recorder.stop();
  }

  async function updateLiveTranscript(mimeType: string) {
    if (
      partialRequestInFlightRef.current ||
      !voiceDetectedRef.current ||
      chunksRef.current.length === 0
    ) {
      return;
    }
    partialRequestInFlightRef.current = true;
    const audio = new Blob([...chunksRef.current], { type: mimeType });
    try {
      const transcript = await transcribe(audio, true);
      if (transcript) setLiveTranscript(transcript);
    } catch {
      // A partial recording can be too short to transcribe. The final request
      // remains authoritative and reports any real error to the learner.
    } finally {
      partialRequestInFlightRef.current = false;
    }
  }

  async function evaluateRecording(audio: Blob) {
    setTranscribing(true);
    const attempt = exerciseEvents.length + 1;
    const retry = attempt > 1;
    try {
      const transcript = await transcribe(audio, false);
      if (!transcript) {
        setError("No speech was detected. Read the sentence aloud and try again.");
        return;
      }
      setLiveTranscript(transcript);
      const sentenceMatch = similarity(transcript, exercise.modelAnswer);
      const event: SpeakingEvent = {
        id: `speaking_${exercise.id}_${attempt}`,
        exerciseId: exercise.id,
        mode: exercise.mode,
        attempt,
        evaluationAvailable: true,
        pronunciationConfidence: sentenceMatch,
        grammarAccuracy: sentenceMatch,
        transcript,
        recognizedWords: [],
        missedWords: [],
        successfulRetry: retry && sentenceMatch >= 70,
      };
      const completedAfter = new Set([...completedIds, exercise.id]);
      onChange({
        ...session,
        activityIndex: currentIndex,
        speakingEvents: [...session.speakingEvents, event],
        speakingComplete: exercises.every((item) => completedAfter.has(item.id)),
      });
    } catch (transcriptionError) {
      setError(
        transcriptionError instanceof Error
          ? transcriptionError.message
          : "Speech recognition failed. Please try again.",
      );
    } finally {
      setTranscribing(false);
    }
  }

  async function transcribe(audio: Blob, partial: boolean): Promise<string> {
    const requestNumber = ++transcriptRequestRef.current;
    const form = new FormData();
    form.append("audio", audio, "aiko-speaking.webm");
    const response = await fetch("/api/audio/transcribe", {
      method: "POST",
      body: form,
    });
    const result: unknown = await response.json().catch(() => null);
    const record =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : null;
    const transcript = typeof record?.transcript === "string" ? record.transcript.trim() : "";
    if (!response.ok || !transcript) {
      const apiMessage = typeof record?.error === "string" ? record.error : "";
      throw new Error(
        partial
          ? "Live transcription is waiting for clear speech."
          : apiMessage || "Speech recognition failed. Please try again.",
      );
    }
    if (requestNumber >= appliedTranscriptRef.current) {
      appliedTranscriptRef.current = requestNumber;
      setLiveTranscript(transcript);
    }
    return transcript;
  }

  function startVoiceDetection(stream: MediaStream) {
    if (typeof AudioContext === "undefined") {
      voiceDetectionAvailableRef.current = false;
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(stream);
    analyser.fftSize = 2_048;
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    audioContextRef.current = context;
    voiceDetectionAvailableRef.current = true;
    void context.resume();

    const sample = () => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        energy += centered * centered;
      }
      const rms = Math.sqrt(energy / samples.length);
      if (rms >= VOICE_RMS_THRESHOLD) {
        consecutiveVoiceFramesRef.current += 1;
        if (consecutiveVoiceFramesRef.current >= REQUIRED_VOICE_FRAMES) {
          voiceDetectedRef.current = true;
        }
      } else {
        consecutiveVoiceFramesRef.current = 0;
      }
      animationFrameRef.current = window.requestAnimationFrame(sample);
    };
    animationFrameRef.current = window.requestAnimationFrame(sample);
  }

  function stopVoiceDetection() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }

  function clearRecordingTimers() {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    if (countdownTimerRef.current !== null) window.clearInterval(countdownTimerRef.current);
    if (liveTimerRef.current !== null) window.clearInterval(liveTimerRef.current);
    stopTimerRef.current = null;
    countdownTimerRef.current = null;
    liveTimerRef.current = null;
  }

  function nextExercise() {
    if (!latest || currentIndex >= exercises.length - 1) return;
    setSpeaking(false);
    setLiveTranscript("");
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
        <p className="mt-3 text-muted">You have up to 10 seconds. AIko shows the live transcript and compares only the sentence.</p>
        <p className="mt-3 text-sm font-semibold tabular-nums text-muted">{currentIndex + 1} / {exercises.length}</p>
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

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!speaking ? (
            <Button type="button" disabled={transcribing} onClick={startRecording}>
              {transcribing ? <LoaderCircle className="size-4 animate-spin" /> : <Mic2 className="size-4" />}
              {transcribing ? "Checking speech…" : "Start recording"}
            </Button>
          ) : (
            <Button type="button" onClick={stopRecording} className="bg-persimmon-500 hover:bg-persimmon-600"><Square className="size-4 fill-current" /> Stop recording</Button>
          )}
        </div>
        {(speaking || transcribing) && (
          <div className="mt-6 rounded-2xl border border-moss-100 bg-moss-50 p-4" aria-live="polite">
            <div className="flex items-center justify-between gap-4 text-xs font-semibold text-moss-700">
              <span>{speaking ? "Listening live…" : "Checking sentence…"}</span>
              {speaking && <span>{secondsRemaining}s</span>}
            </div>
            <p className="mt-3 min-h-7 font-serif text-lg text-ink">
              {liveTranscript || (speaking ? "Your words will appear here." : "Preparing transcript…")}
            </p>
          </div>
        )}
        {error && <p role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
        {latest && !speaking && !transcribing && !error && (
          <div className="mt-7">
            <SpeakingFeedback event={latest} />
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
