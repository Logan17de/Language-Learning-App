"use client";

import Link from "next/link";
import { BookOpen, ChartNoAxesColumnIncreasing, House, LibraryBig, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { label: "Home", href: "/home", icon: House, matches: ["/home"] },
  { label: "Learn", href: "/learn", icon: LibraryBig, matches: ["/learn", "/lesson", "/custom-topic"] },
  { label: "Review", href: "/review", icon: BookOpen, matches: ["/review"] },
  { label: "Progress", href: "/progress", icon: ChartNoAxesColumnIncreasing, matches: ["/progress"] },
  { label: "Profile", href: "/profile", icon: UserRound, matches: ["/profile", "/settings", "/support", "/subscription"] },
];

export function BottomNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] bg-white/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden" aria-label="App navigation">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => {
          const active = item.matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
          const Icon = item.icon;
          return (
            <li key={item.label}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[10px] font-medium transition focus:outline-none focus:ring-2 focus:ring-moss-200", active ? "bg-moss-50 text-moss-700" : "text-stone-500")}>
                <Icon className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
