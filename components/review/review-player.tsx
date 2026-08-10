"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { calculateQuickReviewResult, upsertReviewAnswer } from "@/lib/review-scoring-utils";
import { evaluateAnswer } from "@/lib/scoring-utils";
import { useAppStore } from "@/store/app-store";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { syncReviewCompletion, syncReviewProgress } from "@/lib/sync/backend-sync";

export function ReviewPlayer() {
  const router = useRouter();
  const hydrated = useAppStore((state) => state.hasHydrated);
  const session = useAppStore((state) => state.activeReviewSession);
  const startOrResume = useAppStore((state) => state.startOrResumeReview);
  const save = useAppStore((state) => state.saveReviewSession);
  const reward = useAppStore((state) => state.rewardReviewCompletion);
  const startNew = useAppStore((state) => state.startNewReview);
  const queue = useAppStore((state) => state.progress.reviewQueue);

  useEffect(() => {
    if (hydrated && !session) startOrResume();
  }, [hydrated, session, startOrResume]);

  useEffect(() => {
    if (session?.completed && session.result && !session.rewarded) {
      reward(session.result);
      void syncReviewCompletion(session);
    }
  }, [reward, session]);

  useEffect(() => {
    if (session && !session.completed) void syncReviewProgress(session);
  }, [session]);

  if (!hydrated || !session) {
    return <main className="grid min-h-screen place-items-center bg-paper"><span className="size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" /></main>;
  }
  if (session.activities.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5 py-12">
        <Card className="w-full max-w-xl p-8 text-center sm:p-12">
          <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-moss-50 text-moss-700">
            <Sparkles className="size-7" />
          </span>
          <Badge tone="moss" className="mt-6">Review is clear</Badge>
          <h1 className="mt-4 text-3xl font-semibold">No weak items are due.</h1>
          <p className="mx-auto mt-3 max-w-md leading-7 text-muted">
            Review will contain only kanji, vocabulary, and grammar that need more practice.
          </p>
          <ButtonLink href="/learn" className="mt-7">Continue learning</ButtonLink>
        </Card>
      </main>
    );
  }

  if (session.completed && session.result) {
    const improved = session.result.improvedItemIds.length;
    const weak = session.result.weakItemIds.length;
    return (
      <main className="min-h-screen bg-paper px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-4xl bg-persimmon-100 text-persimmon-600"><Trophy className="size-9" /></span>
          <Badge tone="orange" className="mt-6">Quick review complete</Badge>
          <h1 className="mt-4 text-5xl font-semibold">{session.result.score}%</h1>
          <p className="mt-3 text-muted">{session.result.correctCount} of {session.result.totalCount} items retrieved correctly</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Card><p className="text-2xl font-semibold tabular-nums text-moss-700">{improved}</p><p className="mt-1 text-xs text-muted">items improved</p></Card>
            <Card><p className="text-2xl font-semibold tabular-nums text-persimmon-600">{weak}</p><p className="mt-1 text-xs text-muted">still weak</p></Card>
            <Card><p className="text-2xl font-semibold tabular-nums">+{session.result.xpEarned}</p><p className="mt-1 text-xs text-muted">XP earned once</p></Card>
          </div>
          <div className="mt-6 rounded-3xl bg-moss-50 p-5 text-sm leading-6 text-moss-900">
            {queue.length ? `Your next review is scheduled from ${queue.length} remaining queue items.` : "Everything due today improved. AIko will space the next review."}
          </div>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/home" variant="secondary">Return Home</ButtonLink>
            <Button type="button" onClick={() => { startNew(); router.refresh(); }}><RotateCcw className="size-4" /> Review Again</Button>
          </div>
        </div>
      </main>
    );
  }

  const activity = session.activities[session.currentIndex];
  if (!activity) {
    return <main className="grid min-h-screen place-items-center bg-paper p-6 text-center"><div><h1 className="text-2xl font-semibold">This review set is empty.</h1><ButtonLink href="/review" className="mt-5">Return to review</ButtonLink></div></main>;
  }
  const answer = session.answers.find((item) => item.activityId === activity.id);

  function choose(selectedAnswer: string) {
    const nextAnswers = upsertReviewAnswer(session!.answers, {
      activityId: activity.id,
      queueItemId: activity.queueItemId,
      selectedAnswer,
      correct: evaluateAnswer(selectedAnswer, activity.correctAnswer),
    });
    save({ ...session!, answers: nextAnswers });
  }

  function next() {
    if (!answer) return;
    if (session!.currentIndex === session!.activities.length - 1) {
      const completed = { ...session!, completed: true, answers: session!.answers };
      save({ ...completed, result: calculateQuickReviewResult(completed) });
      return;
    }
    save({ ...session!, currentIndex: session!.currentIndex + 1 });
  }

  return (
    <main className="min-h-screen bg-paper pb-28">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-4xl items-center gap-4 px-5 sm:px-8">
          <button type="button" onClick={() => router.push("/review")} className="grid size-11 place-items-center rounded-full hover:bg-surface-muted" aria-label="Exit quick review"><ArrowLeft className="size-5" aria-hidden="true" /></button>
          <div className="flex-1"><div className="flex justify-between text-xs font-semibold"><span>Quick Review</span><span>{session.currentIndex + 1} / {session.activities.length}</span></div><ProgressBar value={((session.currentIndex + (answer ? 1 : 0)) / session.activities.length) * 100} className="mt-2" /></div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="flex items-center justify-between gap-3"><Badge tone="orange" className="capitalize">{activity.type.replaceAll("-", " ")}</Badge><span className="flex items-center gap-1 text-xs text-muted"><Sparkles className="size-3" aria-hidden="true" /> Known material only</span></div>
        <Card className="mt-6 p-6 sm:p-9">
          <MultipleChoiceCard prompt={activity.prompt} cue={activity.cue} choices={activity.choices} selectedAnswer={answer?.selectedAnswer} correctAnswer={activity.correctAnswer} explanation={activity.explanation} answered={Boolean(answer)} onSelect={choose} />
          {answer && <Button type="button" className="mt-6" onClick={next}>{session.currentIndex === session.activities.length - 1 ? <><Check className="size-4" /> Finish review</> : <>Next item <ArrowRight className="size-4" /></>}</Button>}
        </Card>
      </div>
    </main>
  );
}
