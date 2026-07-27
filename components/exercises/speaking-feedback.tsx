import { CheckCircle2, Gauge, MessageCircleMore, WandSparkles } from "lucide-react";
import type { SpeakingEvent } from "@/types/lesson-session";
import { ProgressBar } from "@/components/ui/progress-bar";

export function SpeakingFeedback({
  event,
  modelAnswer,
}: {
  event: SpeakingEvent;
  modelAnswer: string;
}) {
  if (!event.evaluationAvailable) {
    return (
      <div className="space-y-4 rounded-3xl border border-moss-200 bg-moss-50 p-5" role="status">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-moss-700" />
          <div>
            <p className="font-semibold">Speaking attempt saved</p>
            <p className="text-xs text-stone-500">
              Attempt {event.attempt} · no pronunciation score was generated
            </p>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-moss-700">
            <WandSparkles className="size-4" /> Model answer
          </p>
          <p className="mt-2 font-serif text-lg">{modelAnswer}</p>
        </div>
        <p className="text-xs leading-5 text-stone-500">
          AIko will add pronunciation and grammar feedback after speech evaluation is connected.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4 rounded-3xl border border-moss-200 bg-moss-50 p-5" role="status">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-5 text-moss-700" />
        <div><p className="font-semibold">Speaking check complete</p><p className="text-xs text-stone-500">Attempt {event.attempt}</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Metric label="Pronunciation confidence" value={event.pronunciationConfidence} />
        <Metric label="Grammar accuracy" value={event.grammarAccuracy} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-moss-700"><MessageCircleMore className="size-4" /> Recognized words</p>
          <p className="mt-2 text-sm">{event.recognizedWords.join(" · ")}</p>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-persimmon-600"><Gauge className="size-4" /> Missed or uncertain</p>
          <p className="mt-2 text-sm">{event.missedWords.length ? event.missedWords.join(" · ") : "None on this attempt"}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-moss-700"><WandSparkles className="size-4" /> Natural Japanese suggestion</p>
        <p className="mt-2 font-serif text-lg">{modelAnswer}</p>
      </div>
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
