import { CheckCircle2, Gauge, MessageCircleMore, WandSparkles } from "lucide-react";
import type { SpeakingEvent } from "@/types/lesson-session";
import { ProgressBar } from "@/components/ui/progress-bar";

export function SpeakingFeedback({
  event,
  targetSentence,
}: {
  event: SpeakingEvent;
  targetSentence: string;
}) {
  if (!event.evaluationAvailable) {
    return (
      <div className="space-y-4 rounded-3xl border border-moss-200 bg-moss-50 p-5" role="status">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-moss-700" />
          <div>
            <p className="font-semibold">Speaking attempt saved</p>
            <p className="text-xs text-stone-500">Attempt {event.attempt} · sentence match unavailable</p>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-moss-700"><WandSparkles className="size-4" /> Target sentence</p>
          <p className="mt-2 font-serif text-lg">{targetSentence}</p>
        </div>
        <p className="text-xs leading-5 text-stone-500">Your attempt remains saved. Try again when speech recognition is available.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 rounded-3xl border border-moss-200 bg-moss-50 p-5" role="status">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-5 text-moss-700" />
        <div><p className="font-semibold">Speaking check complete</p><p className="text-xs text-stone-500">OpenAI transcription · attempt {event.attempt}</p></div>
      </div>
      {event.transcript && (
        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs font-semibold text-moss-700">AIko heard</p>
          <p className="mt-2 font-serif text-lg">{event.transcript}</p>
        </div>
      )}
      <div>
        <Metric label="Sentence match" value={event.pronunciationConfidence} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-moss-700"><MessageCircleMore className="size-4" /> Recognized lesson words</p>
          <p className="mt-2 text-sm">{event.recognizedWords.length ? event.recognizedWords.join(" · ") : "No target words matched"}</p>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-persimmon-600"><Gauge className="size-4" /> Missed or uncertain</p>
          <p className="mt-2 text-sm">{event.missedWords.length ? event.missedWords.join(" · ") : "None on this attempt"}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-moss-700"><WandSparkles className="size-4" /> Target sentence</p>
        <p className="mt-2 font-serif text-lg">{targetSentence}</p>
      </div>
      <p className="text-xs leading-5 text-stone-500">Speech-to-text measures what was recognized. Detailed phoneme-level pronunciation scoring can be added later.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs"><span className="font-semibold">{label}</span><span>{value}%</span></div>
      <ProgressBar value={value} className="bg-white" />
    </div>
  );
}
