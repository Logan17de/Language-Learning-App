import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  BrainCircuit,
  Check,
  CirclePlay,
  Ear,
  Eye,
  Languages,
  Lightbulb,
  Mic,
  Sparkles,
} from "lucide-react";
import { PublicAuthProvider } from "@/components/auth/public-auth-provider";
import { PublicPrimaryAction } from "@/components/auth/public-auth-actions";
import { PublicHeader } from "@/components/layout/public-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "AIko — Adaptive Language Learning",
  description:
    "Adaptive language learning through connected stories, vocabulary, grammar, reading, listening, speaking, and progress-aware practice.",
  openGraph: {
    title: "AIko — Adaptive Language Learning",
    description:
      "Connected language lessons that adapt to what you understand, practise, and produce.",
    type: "website",
  },
};

const learningFlow: Array<{
  number: string;
  title: string;
  copy: string;
  icon: LucideIcon;
}> = [
  {
    number: "01",
    title: "AIko chooses what comes next",
    copy: "AIko selects a level-matched lesson using your learning progress, so your next step stays focused instead of feeling like another catalog to sort through.",
    icon: BrainCircuit,
  },
  {
    number: "02",
    title: "Start with one connected story",
    copy: "A single situation introduces useful vocabulary and grammar in context before the lesson asks you to recognise and use them in new ways.",
    icon: BookOpenText,
  },
  {
    number: "03",
    title: "Reuse the same language six ways",
    copy: "Story, Vocabulary, Grammar, Reading, Listening, and Speaking reinforce the same lesson context instead of behaving like unrelated exercises.",
    icon: Languages,
  },
  {
    number: "04",
    title: "Move from recognition to production",
    copy: "The lesson gradually shifts from understanding language to producing it through grammar and speaking activities.",
    icon: Lightbulb,
  },
  {
    number: "05",
    title: "Progress updates automatically",
    copy: "Your answers and practice activity become learning evidence in the background, so you do not need to maintain a separate study queue by hand.",
    icon: Check,
  },
  {
    number: "06",
    title: "Your practice shapes the path",
    copy: "What you know, what you miss, and what you successfully produce help AIko decide which language deserves more attention later.",
    icon: Sparkles,
  },
];

const lessonStages: Array<{
  number: string;
  title: string;
  action: string;
  icon: LucideIcon;
}> = [
  {
    number: "01",
    title: "Story",
    action: "Read",
    icon: BookOpenText,
  },
  {
    number: "02",
    title: "Vocabulary",
    action: "Recall",
    icon: Languages,
  },
  {
    number: "03",
    title: "Grammar",
    action: "Apply",
    icon: Lightbulb,
  },
  {
    number: "04",
    title: "Reading",
    action: "Understand",
    icon: Eye,
  },
  {
    number: "05",
    title: "Listening",
    action: "Hear",
    icon: Ear,
  },
  {
    number: "06",
    title: "Speaking",
    action: "Say",
    icon: Mic,
  },
];

const learningSignals = [
  "Vocabulary answers",
  "Grammar practice",
  "Story word support",
  "Reading responses",
  "Listening activity",
  "Speaking attempts",
];

const plans = [
  {
    name: "Free",
    copy: "Build your core language skills and keep your progress moving.",
    features: [
      "One lesson creation each day",
      "Story, vocabulary, grammar, and reading",
      "Automatic mastery and progress tracking",
    ],
    cta: "Start learning",
    primary: false,
  },
  {
    name: "Premium",
    copy: "Create more often and unlock the complete six-phase lesson.",
    features: [
      "Five lesson creations each day",
      "Listening practice with lesson audio",
      "Speaking practice with live transcription",
    ],
    cta: "Explore Premium",
    primary: true,
  },
];

const focusRing =
  "rounded-md outline-none transition focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2";

export default function LandingPage() {
  return (
    <PublicAuthProvider>
      <div className="overflow-x-clip bg-paper text-ink">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-full bg-moss-900 px-5 py-3 text-sm font-semibold text-white shadow-float transition focus:translate-y-0 focus:outline-none focus:ring-4 focus:ring-moss-200"
        >
          Skip to main content
        </a>
        <PublicHeader />
        <main id="main-content">
          <section className="relative isolate" aria-labelledby="hero-heading">
            <div
              className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_78%_20%,rgba(229,119,72,.16),transparent_34%),radial-gradient(circle_at_18%_14%,rgba(79,128,104,.17),transparent_30%)]"
              aria-hidden="true"
            />
            <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[1.04fr_.96fr] lg:gap-14 lg:py-20">
              <div className="animate-fade-up">
                <Badge className="gap-2 py-2">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Adaptive language learning
                </Badge>
                <h1
                  id="hero-heading"
                  className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.03] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[4.5rem]"
                >
                  Learn through lessons that{" "}
                  <span className="font-serif font-normal italic text-persimmon-500">
                    build on each other.
                  </span>
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
                  One story becomes vocabulary, grammar, reading, listening, and speaking practice.
                  AIko keeps the language connected, records your progress automatically, and uses
                  what you do to help shape what comes next.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <PublicPrimaryAction
                    signedOutLabel="Start learning"
                    signedInLabel="Continue learning"
                    className="group px-7"
                  />
                  <a
                    href="#learning-system"
                    className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-ink hover:bg-white ${focusRing}`}
                  >
                    <CirclePlay className="size-5 text-persimmon-500" aria-hidden="true" />
                    See how it works
                  </a>
                </div>
                <p className="mt-5 flex items-center gap-2 text-sm font-medium text-stone-500">
                  <span className="size-2 rounded-full bg-persimmon-500" aria-hidden="true" />
                  Available now: Japanese · More languages coming
                </p>
              </div>

              <div className="relative mx-auto w-full max-w-lg lg:mr-0">
                <div
                  className="absolute -left-6 top-16 size-28 rounded-full bg-persimmon-100 blur-2xl"
                  aria-hidden="true"
                />
                <div className="relative animate-float-slow rounded-[2rem] border border-white bg-white/85 p-3 shadow-float backdrop-blur">
                  <div className="rounded-[1.6rem] bg-moss-900 p-6 text-white sm:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[.18em] text-moss-200">
                        One connected lesson
                      </span>
                      <Badge tone="orange">6 phases</Badge>
                    </div>
                    <h2 className="mt-5 max-w-sm text-2xl font-semibold leading-tight sm:text-3xl">
                      Keep one context long enough to understand it, recognise it, and use it.
                    </h2>
                    <div className="mt-6 grid grid-cols-2 gap-2.5">
                      {[
                        { label: "Story", icon: BookOpenText },
                        { label: "Vocabulary", icon: Languages },
                        { label: "Grammar + production", icon: Lightbulb },
                        { label: "Read · Listen · Speak", icon: Mic },
                      ].map(({ label, icon: Icon }) => (
                        <div
                          key={label}
                          className="flex items-center gap-3 rounded-2xl bg-white/[.09] px-4 py-3.5"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-persimmon-400">
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <span className="text-sm font-semibold text-white/85">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                      <BrainCircuit className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">Progress works quietly in the background</p>
                      <p className="text-xs leading-5 text-stone-500">
                        Your practice helps AIko decide what deserves more attention later.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="learning-system" className="scroll-mt-20 bg-white py-16 sm:py-20">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
              <div className="mx-auto max-w-3xl text-center">
                <p className="section-kicker">The learning loop</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                  AIko chooses the lesson. Your practice shapes the path.
                </h2>
                <p className="mt-5 text-lg leading-8 text-stone-500">
                  AIko chooses the next lesson based on your level and learning evidence, keeps the
                  same language connected across all six phases, and carries what it learns about
                  your progress into future practice.
                </p>
              </div>
              <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {learningFlow.map(({ number, title, copy, icon: Icon }) => (
                  <li key={title}>
                    <Card className="group relative h-full overflow-hidden p-6 transition hover:-translate-y-1 hover:shadow-float">
                      <span
                        className="absolute right-5 top-2 font-serif text-7xl text-moss-50"
                        aria-hidden="true"
                      >
                        {number}
                      </span>
                      <span className="relative grid size-12 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <h3 className="relative mt-8 text-xl font-semibold">{title}</h3>
                      <p className="relative mt-3 leading-7 text-stone-500">{copy}</p>
                    </Card>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="py-16 sm:py-20" aria-labelledby="adapt-heading">
            <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
              <div>
                <p className="section-kicker">Adaptation grounded in practice</p>
                <h2
                  id="adapt-heading"
                  className="mt-4 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl"
                >
                  Progress comes from what you actually do.
                </h2>
                <p className="mt-4 max-w-xl text-lg leading-8 text-stone-500">
                  AIko uses evidence created inside the lesson to update progress and help target
                  future practice. The goal is simple: spend more time on language that still needs
                  work without turning progress tracking into another task for you.
                </p>
                <p className="mt-5 max-w-xl rounded-2xl border-l-4 border-persimmon-500 bg-white px-5 py-4 font-medium leading-7 shadow-card">
                  Recognition, comprehension, and production can all contribute to the learning path.
                </p>
              </div>
              <div className="rounded-4xl bg-moss-900 p-7 text-white sm:p-8">
                <p className="text-sm font-semibold text-moss-200">Learning evidence may include</p>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {learningSignals.map((signal) => (
                    <li
                      key={signal}
                      className="flex min-h-14 items-center gap-3 rounded-2xl bg-white/[.08] px-4 py-3"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-persimmon-500/20 text-persimmon-400">
                        <Check className="size-4" aria-hidden="true" />
                      </span>
                      <span className="text-sm font-medium text-white/80">{signal}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section id="lesson-journey" className="scroll-mt-20 bg-white py-10 sm:py-12">
            <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="section-kicker">How lessons work</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                    One story, six quick phases.
                  </h2>
                </div>
                <p className="max-w-md text-sm leading-6 text-stone-500 sm:text-right">
                  The same language moves from context to recall, understanding, and use.
                </p>
              </div>
              <ol className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-black/[.06] bg-black/[.06] sm:grid-cols-3 lg:grid-cols-6">
                {lessonStages.map(({ number, title, action, icon: Icon }) => (
                  <li
                    key={title}
                    className="group flex items-center gap-2 bg-paper px-3 py-3.5 sm:gap-3 sm:px-4 sm:py-4"
                  >
                    <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-white text-moss-700 shadow-card sm:size-10 sm:rounded-2xl">
                      <Icon className="size-5" aria-hidden="true" />
                      <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-persimmon-500 text-[9px] font-bold text-white">
                        {Number(number)}
                      </span>
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{title}</h3>
                      <p className="mt-0.5 text-xs text-stone-500">{action}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section id="pricing" className="scroll-mt-20 py-16 sm:py-20">
            <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
              <div className="mx-auto max-w-3xl text-center">
                <p className="section-kicker">Free and Premium</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                  Start with the core path. Add more control when you need it.
                </h2>
                <p className="mt-5 text-lg leading-8 text-stone-500">
                  Free includes one lesson each day and the four core practice phases. Premium adds
                  a higher daily creation limit, Listening, and Speaking.
                </p>
              </div>
              <div className="mt-10 grid gap-6 md:grid-cols-2">
                {plans.map((plan) => (
                  <Card
                    key={plan.name}
                    className={
                      plan.primary
                        ? "flex h-full flex-col border-moss-700 !bg-moss-900 p-8 text-white sm:p-10"
                        : "flex h-full flex-col p-8 sm:p-10"
                    }
                  >
                    <div>
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-3xl font-semibold">{plan.name}</h3>
                        {plan.primary && <Badge tone="orange">$10 / month</Badge>}
                      </div>
                      <p
                        className={`mt-5 leading-7 ${
                          plan.primary ? "text-white/70" : "text-stone-500"
                        }`}
                      >
                        {plan.copy}
                      </p>
                    </div>
                    <ul className="mt-8 flex-1 space-y-4 text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                              plan.primary
                                ? "bg-persimmon-500/20 text-persimmon-400"
                                : "bg-moss-100 text-moss-600"
                            }`}
                          >
                            <Check className="size-3.5" aria-hidden="true" />
                          </span>
                          <span className={plan.primary ? "text-white/85" : "text-stone-600"}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <PublicPrimaryAction
                      signedOutLabel={plan.cta}
                      signedOutHref={plan.primary ? "/signup?next=/subscription" : "/signup"}
                      signedInLabel={plan.primary ? "View Premium" : "Go to dashboard"}
                      signedInHref={plan.primary ? "/subscription" : "/home"}
                      showAiIcon={plan.primary}
                      variant={plan.primary ? "primary" : "secondary"}
                      className={
                        plan.primary
                          ? "mt-9 w-full bg-persimmon-500 hover:bg-persimmon-600"
                          : "mt-9 w-full"
                      }
                    />
                  </Card>
                ))}
              </div>
              <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-stone-500">
                Dodo Payments shows the final local currency and applicable tax before you pay.
              </p>
            </div>
          </section>

          <section className="px-5 py-12 sm:px-8 sm:py-16" aria-labelledby="final-cta-heading">
            <div className="mx-auto max-w-7xl overflow-hidden rounded-4xl bg-persimmon-50 px-6 py-10 text-center sm:px-16 sm:py-12">
              <p className="section-kicker !text-persimmon-600">Keep moving forward</p>
              <h2
                id="final-cta-heading"
                className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"
              >
                Your next language starts here.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-stone-500">
                Start with one connected lesson. AIko keeps the language together and uses your
                practice to help shape what comes next.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <PublicPrimaryAction
                  signedOutLabel="Create your account"
                  signedInLabel="Continue learning"
                  className="group"
                />
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-black/[.06] bg-white">
          <div className="mx-auto flex max-w-7xl justify-end px-5 py-8 sm:px-8">
            <nav
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-stone-500"
              aria-label="Footer navigation"
            >
              <a className={focusRing} href="#lesson-journey">How lessons work</a>
              <a className={focusRing} href="#pricing">Premium</a>
              <a className={focusRing} href="/support">Support</a>
              <a className={focusRing} href="/privacy">Privacy</a>
              <a className={focusRing} href="/terms">Terms</a>
            </nav>
          </div>
          <div className="border-t border-black/[.06]">
            <p className="mx-auto max-w-7xl px-5 py-5 text-xs text-stone-500 sm:px-8">
              © 2026 AIko. Built independently with the help of AI.
            </p>
          </div>
        </footer>
      </div>
    </PublicAuthProvider>
  );
}
