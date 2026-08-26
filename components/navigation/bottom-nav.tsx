"use client";

import Link from "next/link";
import {
  BookOpen,
  ChartNoAxesColumnIncreasing,
  House,
  UserRound,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { label: "Home", href: "/home", icon: House, matches: ["/home"] },
  {
    label: "Learn",
    href: "/learn",
    icon: BookOpen,
    matches: ["/learn", "/lesson", "/custom-topic"],
  },
  {
    label: "Progress",
    href: "/progress",
    icon: ChartNoAxesColumnIncreasing,
    matches: ["/progress"],
  },
  {
    label: "Profile",
    href: "/profile",
    icon: UserRound,
    matches: ["/profile", "/settings", "/support", "/subscription"],
  },
];

export function BottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-nav lg:hidden"
      aria-label="App navigation"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {items.map((item) => {
          const active = item.matches.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
          );
          const Icon = item.icon;

          return (
            <li key={item.label}>
              <Link
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold transition duration-180 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-300 active:scale-[0.98]",
                  active ? "text-moss-700" : "text-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-xl transition duration-180",
                    active ? "bg-moss-100 text-moss-700" : "bg-transparent",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
