import { CheckCircle2 } from "lucide-react";
import type { SpeakingEvent } from "@/types/lesson-session";
import { ProgressBar } from "@/components/ui/progress-bar";

export function SpeakingFeedback({ event }: { event: SpeakingEvent }) {
  return (
    <div className="space-y-4 rounded-3xl border border-moss-200 bg-moss-50 p-5" role="status">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-5 text-moss-700" />
        <div>
          <p className="font-semibold">Sentence checked</p>
          <p className="text-xs text-muted">Attempt {event.attempt}</p>
        </div>
      </div>
      {event.transcript && (
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-xs font-semibold text-moss-700">AIko heard</p>
          <p className="mt-2 font-serif text-lg">{event.transcript}</p>
        </div>
      )}
      <div>
        <div className="mb-2 flex justify-between text-xs">
          <span className="font-semibold">Sentence match</span>
          <span>{event.pronunciationConfidence}%</span>
        </div>
        <ProgressBar value={event.pronunciationConfidence} className="bg-surface" />
      </div>
    </div>
  );
}
