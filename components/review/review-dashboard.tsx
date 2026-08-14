"use client";

import { useMemo } from "react";
import { BookOpenCheck, RotateCcw } from "lucide-react";
import type { ReviewDashboardItem } from "@/types/review-session";
import { useAppStore } from "@/store/app-store";
import { AppShell } from "@/components/layout/app-shell";
import { ReviewItemCard } from "@/components/review/review-item-card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

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
            <p className="section-kicker">Memory sanctuary</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">
              Rekindle what is fading.
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
              Kanji, vocabulary, grammar, listening, and speaking appear here only when your lesson results show that they need another pass.
            </p>
          </div>
          {weakItems.length > 0 && (
            <ButtonLink href="/review/session" className="px-7 sm:shrink-0">
              <RotateCcw className="size-4" aria-hidden="true" />
              Start review
            </ButtonLink>
          )}
        </header>

        <Card className="mt-8 flex items-center justify-between gap-4 p-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-moss-100 text-moss-700">
              <BookOpenCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">Weak items</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                Ordered from your current review queue
              </p>
            </div>
          </div>
          <Badge tone={weakItems.length ? "orange" : "moss"}>
            {weakItems.length}
          </Badge>
        </Card>

        {weakItems.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {weakItems.map((item) => (
              <ReviewItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <Card className="mt-5 grid min-h-72 place-items-center border-dashed text-center">
            <div className="max-w-md">
              <BookOpenCheck
                className="mx-auto size-10 text-moss-400"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-xl font-semibold">No weak items right now.</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Complete another lesson and AIko will add anything that needs review.
              </p>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
