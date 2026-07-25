"use client";

import { useMemo } from "react";
import { BookOpenCheck, RotateCcw } from "lucide-react";
import type { ReviewDashboardItem } from "@/types/review-session";
import { useAppStore } from "@/store/app-store";
import { AppShell } from "@/components/layout/app-shell";
import { ReviewItemCard } from "@/components/review/review-item-card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ReviewDashboard() {
  const queue = useAppStore((state) => state.progress.reviewQueue);
  const weakItems = useMemo<ReviewDashboardItem[]>(
    () =>
      queue
        .filter((item) => item.confidence < 70 || item.overdue)
        .map((item) => ({
          ...item,
          status: item.overdue ? "overdue" : "weak",
        })),
    [queue],
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">Review</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Practice only what is weak.
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-stone-500">
              Kanji, vocabulary, grammar, listening, and speaking appear here
              only when your lesson results show that they need more practice.
            </p>
          </div>
          {weakItems.length > 0 && (
            <ButtonLink href="/review/session" className="px-7">
              <RotateCcw className="size-4" />
              Start review
            </ButtonLink>
          )}
        </header>

        <div className="mt-8 flex items-center justify-between rounded-3xl bg-moss-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-white text-moss-700">
              <BookOpenCheck className="size-5" />
            </span>
            <div>
              <p className="font-semibold">Weak items</p>
              <p className="text-xs text-stone-500">
                Ordered from your current review queue
              </p>
            </div>
          </div>
          <Badge tone={weakItems.length ? "orange" : "moss"}>
            {weakItems.length}
          </Badge>
        </div>

        {weakItems.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {weakItems.map((item) => (
              <ReviewItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-4xl bg-white py-16 text-center">
            <BookOpenCheck className="mx-auto size-9 text-moss-300" />
            <h2 className="mt-4 text-xl font-semibold">
              No weak items right now.
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              Complete another lesson and AIko will add anything that needs
              review.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
