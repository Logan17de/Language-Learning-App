"use client";

import { PublicHeaderActions } from "@/components/auth/public-auth-actions";
import { Brand } from "@/components/ui/brand";

const navigationLinkClass =
  "inline-flex min-h-11 items-center rounded-xl px-2 outline-none transition duration-180 hover:bg-surface-muted hover:text-ink focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
        <Brand />
        <nav
          className="hidden items-center gap-3 text-sm font-medium text-muted md:flex"
          aria-label="Primary navigation"
        >
          <a className={navigationLinkClass} href="#learning-system">
            Method
          </a>
          <a className={navigationLinkClass} href="#lesson-journey">
            Lesson journey
          </a>
          <a className={navigationLinkClass} href="#pricing">
            Pricing
          </a>
          <a className={navigationLinkClass} href="#founder">
            Our story
          </a>
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <PublicHeaderActions />
        </div>
      </div>
    </header>
  );
}
