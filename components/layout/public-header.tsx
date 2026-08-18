"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { PublicHeaderActions } from "@/components/auth/public-auth-actions";
import { Brand } from "@/components/ui/brand";

const navigation = [
  { href: "#learning-system", label: "Method" },
  { href: "#lesson-journey", label: "How lessons work" },
  { href: "#pricing", label: "Premium" },
  { href: "#founder", label: "Our story" },
] as const;

const navigationLinkClass =
  "inline-flex min-h-11 items-center rounded-xl px-2 outline-none transition duration-180 hover:bg-surface-muted hover:text-ink focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

export function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
        <Brand />
        <nav
          className="hidden items-center gap-3 text-sm font-medium text-muted md:flex"
          aria-label="Primary navigation"
        >
          {navigation.map((item) => (
            <a key={item.href} className={navigationLinkClass} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <PublicHeaderActions />
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl text-ink outline-none transition hover:bg-surface-muted focus-visible:ring-4 focus-visible:ring-moss-200 md:hidden"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="public-mobile-navigation"
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="public-mobile-navigation"
          className="border-t border-border bg-surface px-5 py-3 text-sm font-medium text-muted md:hidden sm:px-8"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto grid max-w-7xl gap-1">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex min-h-12 items-center rounded-xl px-3 outline-none transition hover:bg-surface-muted hover:text-ink focus-visible:ring-4 focus-visible:ring-moss-200"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
