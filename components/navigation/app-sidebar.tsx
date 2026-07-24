"use client";

import {
  BookOpen,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  Crown,
  House,
  LibraryBig,
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
  { label: "Learn", href: "/learn", icon: LibraryBig },
  { label: "Review", href: "/review", icon: BookOpen },
  { label: "Progress", href: "/progress", icon: ChartNoAxesColumnIncreasing },
  { label: "Profile", href: "/profile", icon: UserRound },
];

const secondary = [
  { label: "Custom topic", href: "/custom-topic", icon: Sparkles },
  { label: "Subscription", href: "/subscription", icon: Crown },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Support", href: "/support", icon: CircleHelp },
];

export function AppSidebar() {
  const pathname = usePathname() ?? "";
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-black/[0.06] bg-white px-5 py-7 lg:flex">
      <Brand />
      <nav className="mt-10 flex flex-1 flex-col" aria-label="App navigation">
        <div className="space-y-1">
          {primary.map((item) => <SidebarLink key={item.href} {...item} pathname={pathname} />)}
        </div>
        <p className="mb-2 mt-7 px-4 text-[10px] font-bold uppercase tracking-[.18em] text-stone-300">More</p>
        <div className="space-y-1">
          {secondary.map((item) => <SidebarLink key={item.href} {...item} pathname={pathname} />)}
        </div>
      </nav>
      <div className="rounded-3xl bg-moss-900 p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-moss-200">Daily thought</p>
        <p className="mt-2 font-serif text-lg">一歩ずつ</p>
        <p className="mt-1 text-xs text-white/65">One step at a time.</p>
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
  const active = pathname === href || pathname.startsWith(`${href}/`) ||
    (href === "/learn" && pathname.startsWith("/lesson/"));
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-moss-100", active ? "bg-moss-50 text-moss-700" : "text-stone-600 hover:bg-moss-50 hover:text-moss-700")}>
      <Icon className="size-5" />
      {label}
    </Link>
  );
}
