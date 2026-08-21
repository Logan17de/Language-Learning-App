"use client";

import { useEffect, useState } from "react";
import { PartyPopper, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  evaluateLevelProgress,
  type LevelProgress,
} from "@/lib/learner-level-progression";
import { profileRepository } from "@/lib/repositories/profile-repository";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";
import type { JLPTLevel } from "@/types/lesson";

const LEVEL_VALUES: readonly JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

function asLevel(value: string | null | undefined): JLPTLevel | null {
  return LEVEL_VALUES.includes(value as JLPTLevel) ? (value as JLPTLevel) : null;
}

/**
 * Checks for an earned level promotion once a lesson is finished.
 *
 * A learner moves up only when every tracked item at their current level has
 * reached the learned threshold; they never choose the level themselves. When
 * that happens the profile level is advanced and the learner is told, rather
 * than the change happening silently.
 */
export function LevelPromotionCelebration() {
  const user = useAppStore((state) => state.user);
  const onboarding = useAppStore((state) => state.onboarding);
  const setLevel = useAppStore((state) => state.setLevel);
  const [promotion, setPromotion] = useState<LevelProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (getBackendMode() !== "supabase" || !user.id) return;
    const currentLevel = asLevel(onboarding.level ?? user.level);
    if (!currentLevel) return;

    let active = true;
    void Promise.resolve().then(async () => {
      const client = createClient();
      if (!client) return;

      const progress = await evaluateLevelProgress(
        client as never,
        user.id,
        currentLevel,
      );
      if (!active || !progress?.eligible || !progress.nextLevel) return;

      // Advance the profile first: the celebration should only ever appear for
      // a promotion that actually persisted.
      const saved = await profileRepository.updateLearningPreferences({
        level: progress.nextLevel,
      });
      if (!active || !saved.ok) return;

      setLevel(progress.nextLevel);
      setPromotion(progress);
    });

    return () => {
      active = false;
    };
  }, [user.id, user.level, onboarding.level, setLevel]);

  if (!promotion?.nextLevel || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-promotion-title"
      className="fixed inset-0 z-[130] grid place-items-center bg-ink/40 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-float">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-moss-100 text-moss-700">
          <PartyPopper className="size-8" aria-hidden="true" />
        </span>
        <p className="section-kicker mt-6">Level up</p>
        <h2
          id="level-promotion-title"
          className="mt-4 text-3xl font-semibold tracking-tight"
        >
          You have moved up to {promotion.nextLevel}.
        </h2>
        <p className="mt-3 leading-7 text-stone-500">
          You reached full mastery across every {promotion.level} item AIko
          tracks, so your level is now {promotion.nextLevel}. New lessons will
          build from here.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-moss-50 px-4 py-2 text-sm font-semibold text-moss-800">
          <Sparkles className="size-4" aria-hidden="true" />
          {promotion.masteredItems} items mastered
        </p>
        <Button
          type="button"
          className="mt-7 w-full"
          onClick={() => setDismissed(true)}
        >
          Keep learning
        </Button>
      </div>
    </div>
  );
}
