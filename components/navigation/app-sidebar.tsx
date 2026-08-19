"use client";

import {
  BookOpen,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  Crown,
  House,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/ui/brand";
import { cn } from "@/lib/utils";

const primary = [
  { label: "Home", href: "/home", icon: House },
  { label: "Learn", href: "/learn", icon: BookOpen },
  { label: "Progress", href: "/progress", icon: ChartNoAxesColumnIncreasing },
  { label: "Profile", href: "/profile", icon: UserRound },
];

const secondary = [
  { label: "Create lesson", href: "/custom-topic", icon: Sparkles },
  { label: "Subscription", href: "/subscription", icon: Crown },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Support", href: "/support", icon: CircleHelp },
];

export function AppSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface px-5 py-7 lg:flex">
      <Brand />
      <nav className="mt-10 flex flex-1 flex-col" aria-label="App navigation">
        <div className="space-y-1.5">
          {primary.map((item) => (
            <SidebarLink key={item.href} {...item} pathname={pathname} />
          ))}
        </div>
        <p className="mb-2 mt-7 px-3 text-[11px] font-bold uppercase tracking-[.16em] text-muted">
          More
        </p>
        <div className="space-y-1.5">
          {secondary.map((item) => (
            <SidebarLink key={item.href} {...item} pathname={pathname} />
          ))}
        </div>
      </nav>

      <div className="rounded-3xl border border-border bg-surface-muted p-4">
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-moss-700">
          Daily focus
        </p>
        <p className="mt-2 font-serif text-lg text-ink">一歩ずつ</p>
        <p className="mt-1 text-xs leading-5 text-muted">One step at a time.</p>
      </div>
    </aside>
  );
}

function SidebarLink({
  label,
  href,
  icon: Icon,
  pathname,
}: {
  label: string;
  href: string;
  icon: typeof House;
  pathname: string;
}) {
  const active =
    pathname === href ||
    pathname.startsWith(`${href}/`) ||
    (href === "/learn" && pathname.startsWith("/lesson/"));

  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition duration-180 focus:outline-none focus-visible:ring-4 focus-visible:ring-moss-100",
        active
          ? "bg-moss-50 text-moss-800"
          : "text-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl transition duration-180",
          active
            ? "bg-moss-600 text-white shadow-soft"
            : "bg-surface-muted text-muted group-hover:bg-moss-100 group-hover:text-moss-700",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span>{label}</span>
      {active && (
        <span
          className="ml-auto size-1.5 rounded-full bg-persimmon-500"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
