"use client";

import { BookCheck, CalendarDays, Crown, Flame, Gem, LogOut, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { ProfileForm } from "@/components/profile/profile-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";

export function ProfilePage() {
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const subscription = useAppStore((state) => state.subscription);
  const signOut = useAppStore((state) => state.signOut);
  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header><p className="section-kicker">Your profile</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">The learner behind the progress.</h1></header>
      <div className="mt-8 grid gap-6 lg:grid-cols-[.72fr_1.28fr]">
        <aside className="space-y-6">
          <Card className="overflow-hidden p-0">
            <div className="bg-moss-900 p-7 text-center text-white">
              <div className="mx-auto grid size-24 place-items-center rounded-4xl bg-persimmon-400 text-3xl font-semibold text-moss-900">{user.name.charAt(0).toUpperCase()}</div>
              <h2 className="mt-5 text-2xl font-semibold">{user.name}</h2>
              <p className="mt-2 flex items-center justify-center gap-2 text-sm text-white/55"><Mail className="size-4" /> {user.email}</p>
              <Badge tone="orange" className="mt-5 capitalize"><Crown className="mr-1 size-3" /> {subscription.plan}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-px bg-stone-100">
              <MiniStat icon={Flame} value={`${user.streakDays}`} label="day streak" />
              <MiniStat icon={Gem} value={user.xp.toLocaleString()} label="XP" />
              <MiniStat icon={BookCheck} value={`${progress.completedLessonIds.length}`} label="lessons" />
              <MiniStat icon={CalendarDays} value={user.joinDate} label="joined" />
            </div>
          </Card>
          <div className="grid gap-3">
            <ButtonLink href="/settings" variant="secondary">Settings</ButtonLink>
            <ButtonLink href="/subscription" variant="secondary">Manage subscription</ButtonLink>
            <ButtonLink href="/support" variant="ghost">Help & support</ButtonLink>
            <Button type="button" variant="ghost" onClick={async () => { await authService.signOut(); signOut(); router.replace("/login"); router.refresh(); }}><LogOut className="size-4" /> Log out</Button>
          </div>
        </aside>
        <Card className="p-7">
          <div className="mb-7"><h2 className="text-2xl font-semibold">Learning profile</h2><p className="mt-2 text-sm text-stone-500">These preferences shape recommendations and future custom lessons.</p></div>
          <ProfileForm />
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, value, label }: { icon: typeof Flame; value: string; label: string }) {
  return <div className="bg-white p-4 text-center"><Icon className="mx-auto size-4 text-moss-600" /><p className="mt-2 text-sm font-semibold">{value}</p><p className="mt-1 text-[10px] text-stone-400">{label}</p></div>;
}
