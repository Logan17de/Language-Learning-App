"use client";

import {
  BookCheck,
  Brain,
  CalendarDays,
  Check,
  Crown,
  Flame,
  Gem,
  LockKeyhole,
  LogOut,
  Mail,
  MessageCircleMore,
  Route,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { ProfileForm } from "@/components/profile/profile-form";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authService } from "@/lib/auth/auth-service";

const premiumFeatures = [
  {
    icon: Sparkles,
    title: "Custom AI lessons",
    copy: "Create complete lessons around your own topic, level, weak grammar, and unseen kanji.",
    href: "/custom-topic",
    action: "Create a lesson",
  },
  {
    icon: Route,
    title: "Interest-shaped path",
    copy: "AIko ranks suitable lessons using your interests while preventing repeated lesson assignments.",
    href: "/learn",
    action: "Continue learning",
  },
  {
    icon: MessageCircleMore,
    title: "Extended speaking",
    copy: "Use the full speaking progression and meaning-based response evaluation.",
    href: "/learn",
    action: "Practise speaking",
  },
  {
    icon: TrendingUp,
    title: "Complete insights",
    copy: "See deeper strength, weakness, mastery, and adaptive-review signals.",
    href: "/progress",
    action: "View insights",
  },
] as const;

const freeIncluded = [
  "Level-matched lessons selected by AIko",
  "Core story, vocabulary, grammar, and review",
  "Basic progress and strength/weakness feedback",
];

const freeLocked = [
  "Interest-based lesson recommendations",
  "Custom-topic AI lesson generation",
  "Extended speaking and semantic evaluation",
  "Deeper mastery analytics and adaptive insights",
];

export function ProfilePage() {
  const subscription = useAppStore((state) => state.subscription);
  return subscription.plan === "premium"
    ? <PremiumAccountPage />
    : <FreeAccountPage />;
}

function PremiumAccountPage() {
  const onboarding = useAppStore((state) => state.onboarding);
  const subscription = useAppStore((state) => state.subscription);
  const hasInterests = onboarding.interests.length > 0;

  return (
    <AccountLayout eyebrow="Premium account" title="Your complete AIko learning system.">
      <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
        <aside className="space-y-5">
          <AccountIdentityCard premium />
          <Card className="border-moss-900 bg-moss-900 p-6 text-white">
            <div className="flex items-center justify-between gap-3">
              <Badge tone="orange"><Crown className="mr-1 size-3" /> Premium active</Badge>
              <span className="text-xs capitalize text-white/55">{subscription.billingPeriod} plan</span>
            </div>
            <h2 className="mt-5 text-2xl font-semibold">Everything is unlocked.</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              {hasInterests
                ? "Your interests are actively shaping lesson selection and custom generation."
                : "Add interests to your learning profile so AIko can personalise your premium path."}
            </p>
            <ButtonLink href="/subscription" className="mt-5 w-full bg-persimmon-500 hover:bg-persimmon-600">
              Premium account details
            </ButtonLink>
          </Card>
          <AccountActions />
        </aside>

        <div className="space-y-5">
          <section className="grid gap-4 sm:grid-cols-2" aria-label="Premium features">
            {premiumFeatures.map(({ icon: Icon, title, copy, href, action }) => (
              <Card key={title} className="flex h-full flex-col p-5">
                <div className="grid size-10 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-600">
                  <Icon className="size-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">{title}</h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-stone-500">{copy}</p>
                <ButtonLink href={href} variant="ghost" className="mt-3 justify-start px-0 text-moss-700">
                  {action}
                </ButtonLink>
              </Card>
            ))}
          </section>
          <Card className="p-6 sm:p-7">
            <div className="mb-5">
              <Badge tone="moss"><Brain className="mr-1 size-3" /> Personalisation active</Badge>
              <h2 className="mt-3 text-2xl font-semibold">Learning profile</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                These preferences directly influence premium lesson ranking and AI-generated content.
              </p>
            </div>
            <ProfileForm />
          </Card>
        </div>
      </div>
    </AccountLayout>
  );
}

function FreeAccountPage() {
  return (
    <AccountLayout eyebrow="Free account" title="A focused start, with clear limits.">
      <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
        <aside className="space-y-5">
          <AccountIdentityCard premium={false} />
          <AccountActions />
        </aside>

        <div className="space-y-5">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-stone-100 bg-white p-6 sm:p-7">
              <Badge tone="neutral">Current free access</Badge>
              <h2 className="mt-3 text-2xl font-semibold">Keep learning at your level.</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                AIko assigns random, non-repeating lessons at your current level. Interests can be saved, but they do not affect free lesson selection.
              </p>
            </div>
            <div className="grid gap-px bg-stone-100 sm:grid-cols-2">
              <PlanList title="Included" items={freeIncluded} icon={Check} tone="included" />
              <PlanList title="Premium only" items={freeLocked} icon={LockKeyhole} tone="locked" />
            </div>
          </Card>

          <Card className="border-persimmon-100 bg-persimmon-50/60 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-persimmon-700">Unlock the full system</p>
              <h2 className="mt-2 text-2xl font-semibold">Personalise every part of learning.</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
                Premium adds custom AI lessons, interest matching, extended speaking, and complete progress insights.
              </p>
            </div>
            <ButtonLink href="/subscription" className="mt-5 shrink-0 bg-persimmon-500 hover:bg-persimmon-600 sm:mt-0">
              Compare premium
            </ButtonLink>
          </Card>

          <Card className="p-6 sm:p-7">
            <div className="mb-5">
              <h2 className="text-2xl font-semibold">Learning profile</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Your level and study preferences still guide pacing. Saved interests activate after upgrading.
              </p>
            </div>
            <ProfileForm />
          </Card>
        </div>
      </div>
    </AccountLayout>
  );
}

function AccountLayout({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-9">
      <header className="mb-7">
        <p className="section-kicker">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
      </header>
      {children}
    </div>
  );
}

function AccountIdentityCard({ premium }: { premium: boolean }) {
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);

  return (
    <Card className="overflow-hidden p-0">
      <div className={premium ? "bg-moss-900 p-6 text-center text-white" : "bg-white p-6 text-center"}>
        <div className={premium
          ? "mx-auto grid size-20 place-items-center rounded-3xl bg-persimmon-400 text-2xl font-semibold text-moss-900"
          : "mx-auto grid size-20 place-items-center rounded-3xl bg-moss-100 text-2xl font-semibold text-moss-800"
        }>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <h2 className="mt-4 text-2xl font-semibold">{user.name}</h2>
        <p className={premium
          ? "mt-2 flex items-center justify-center gap-2 text-sm text-white/55"
          : "mt-2 flex items-center justify-center gap-2 text-sm text-stone-500"
        }>
          <Mail className="size-4" /> {user.email}
        </p>
        <Badge tone={premium ? "orange" : "neutral"} className="mt-4">
          {premium && <Crown className="mr-1 size-3" />}
          {premium ? "Premium account" : "Free account"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-px bg-stone-100">
        <MiniStat icon={Flame} value={`${user.streakDays}`} label="day streak" />
        <MiniStat icon={Gem} value={user.xp.toLocaleString()} label="XP" />
        <MiniStat icon={BookCheck} value={`${progress.completedLessonIds.length}`} label="lessons" />
        <MiniStat icon={CalendarDays} value={user.joinDate} label="joined" />
      </div>
    </Card>
  );
}

function AccountActions() {
  const router = useRouter();
  const signOut = useAppStore((state) => state.signOut);
  return (
    <div className="grid gap-2">
      <ButtonLink href="/settings" variant="secondary">Settings</ButtonLink>
      <ButtonLink href="/support" variant="ghost">Help & support</ButtonLink>
      <Button
        type="button"
        variant="ghost"
        onClick={async () => {
          await authService.signOut();
          signOut();
          router.replace("/login");
          router.refresh();
        }}
      >
        <LogOut className="size-4" /> Log out
      </Button>
    </div>
  );
}

function PlanList({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: typeof Check;
  tone: "included" | "locked";
}) {
  return (
    <div className="bg-white p-6">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-stone-600">
            <Icon className={tone === "included"
              ? "mt-1 size-4 shrink-0 text-moss-600"
              : "mt-1 size-4 shrink-0 text-stone-400"
            } />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Flame;
  value: string;
  label: string;
}) {
  return (
    <div className="bg-white p-4 text-center">
      <Icon className="mx-auto size-4 text-moss-600" />
      <p className="mt-2 text-sm font-semibold">{value}</p>
      <p className="mt-1 text-[10px] text-stone-400">{label}</p>
    </div>
  );
}
