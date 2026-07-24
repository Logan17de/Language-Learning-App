import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpenText,
  BrainCircuit,
  Check,
  CirclePlay,
  Ear,
  Eye,
  Headphones,
  Languages,
  Lightbulb,
  Mic,
  RefreshCw,
  Sparkles,
  UserRound,
} from "lucide-react";
import { PublicPrimaryAction } from "@/components/auth/public-auth-actions";
import { PublicHeader } from "@/components/layout/public-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Brand } from "@/components/ui/brand";

export const metadata: Metadata = {
  title: "AIko — Adaptive Language Learning",
  description:
    "Learn through structured stories, vocabulary, grammar, reading, listening, speaking, and personalised review. AIko launches with Japanese and is designed for more languages.",
  openGraph: {
    title: "AIko — Adaptive Language Learning",
    description:
      "Structured language learning through connected lessons and personalised review. Launching first with Japanese.",
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
    title: "Learn through a story",
    copy: "Meet useful language inside a situation that gives every new idea a reason to exist.",
    icon: BookOpenText,
  },
  {
    number: "02",
    title: "Understand the building blocks",
    copy: "Explore vocabulary and grammar without losing the context that introduced them.",
    icon: Lightbulb,
  },
  {
    number: "03",
    title: "Read and listen",
    copy: "Recognise the same language in text and audio, with support available when needed.",
    icon: Headphones,
  },
  {
    number: "04",
    title: "Practise speaking",
    copy: "Move from guided models toward your own response at a pace that feels manageable.",
    icon: Mic,
  },
  {
    number: "05",
    title: "Review what needs work",
    copy: "Return to the words and patterns that were difficult instead of repeating everything.",
    icon: RefreshCw,
  },
  {
    number: "06",
    title: "Let AIko choose what comes next",
    copy: "Your level and learning evidence guide one new assignment at a time, without repeating an assigned lesson.",
    icon: BrainCircuit,
  },
];

const lessonStages: Array<{
  number: string;
  title: string;
  copy: string;
  icon: LucideIcon;
}> = [
  { number: "01", title: "Story", copy: "Meet the lesson in context.", icon: BookOpenText },
  { number: "02", title: "Vocabulary", copy: "Understand useful words.", icon: Languages },
  { number: "03", title: "Grammar", copy: "See how ideas connect.", icon: Lightbulb },
  { number: "04", title: "Reading", copy: "Recognise language in text.", icon: Eye },
  { number: "05", title: "Listening", copy: "Follow meaning in audio.", icon: Ear },
  { number: "06", title: "Speaking", copy: "Turn input into expression.", icon: Mic },
  { number: "07", title: "Review", copy: "Recall without the hints.", icon: RefreshCw },
];

const learningSignals = [
  "Incorrect answers",
  "Revealed readings",
  "Opened meanings",
  "Repeated listening",
  "Speaking attempts",
  "Review performance",
];

const plans = [
  {
    name: "Free",
    copy: "A clear, structured way to begin learning.",
    features: [
      "Structured language lessons",
      "Limited learning sessions",
      "Basic vocabulary and grammar review",
      "Basic progress tracking",
      "Limited speaking practice",
      "Random non-repeating lessons at your level",
    ],
    price: "¥0",
    cadence: "",
    annual: null,
    cta: "Start Free",
    primary: false,
  },
  {
    name: "Pro",
    copy: "More freedom, feedback, and continuity as you grow.",
    features: [
      "Unlimited learning sessions",
      "Request lessons about your own topics",
      "Level- and interest-matched lesson assignments",
      "Voice-based speaking practice",
      "Advanced reading and pronunciation feedback",
      "Adaptive review and learner memory",
      "Full progress insights",
      "Future languages and premium tutors when available",
    ],
    price: "¥2,000",
    cadence: "/ month",
    annual: "¥20,000 / year",
    cta: "Explore Pro",
    primary: true,
  },
];

const focusRing =
  "rounded-md outline-none transition focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2";

export default function LandingPage() {
  return (
    <div className="overflow-x-clip bg-paper text-ink">
      <PublicHeader />
      <main>
        <section className="relative isolate" aria-labelledby="hero-heading">
          <div
            className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_78%_20%,rgba(229,119,72,.16),transparent_34%),radial-gradient(circle_at_18%_14%,rgba(79,128,104,.17),transparent_30%)]"
            aria-hidden="true"
          />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[1.04fr_.96fr] lg:gap-14 lg:py-20">
            <div className="animate-fade-up">
              <Badge className="gap-2 py-2">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Structured language learning, personalised by AI
              </Badge>
              <h1
                id="hero-heading"
                className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.03] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[4.5rem]"
              >
                Learn a language through lessons that{" "}
                <span className="font-serif font-normal italic text-persimmon-500">
                  adapt to you.
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
                AIko combines structured lessons, speaking practice, review, and personalised
                guidance in one learning experience. Japanese is only the beginning.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <PublicPrimaryAction signedOutLabel="Start learning" className="group px-7" />
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
                Currently launching with Japanese.
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
                      One connected system
                    </span>
                    <Badge tone="orange">Built to adapt</Badge>
                  </div>
                  <h2 className="mt-5 max-w-sm text-2xl font-semibold leading-tight sm:text-3xl">
                    A learning loop built around your practice.
                  </h2>
                  <div className="mt-6 grid grid-cols-2 gap-2.5">
                    {[
                      { label: "Learn", icon: BookOpenText },
                      { label: "Practise", icon: Mic },
                      { label: "Review", icon: RefreshCw },
                      { label: "Adapt", icon: BrainCircuit },
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
                    <Languages className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">Japanese first</p>
                    <p className="text-xs leading-5 text-stone-500">
                      More languages will follow as AIko grows.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="learning-system"
          className="scroll-mt-20 flex min-h-[calc(100svh-5rem)] items-center bg-white py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="section-kicker">A connected learning loop</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                More than lessons. A learning system.
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-500">
                Each activity builds on the one before it. What you practise, reveal, retry,
                and remember helps AIko decide where your attention may be most useful next.
                Learners do not browse or star lessons; the path handles that decision.
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
                Guidance based on what you actually do.
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-8 text-stone-500">
                AIko does not guess what you are thinking. It uses learning evidence from the
                lesson to shape review and future recommendations.
              </p>
              <p className="mt-5 max-w-xl rounded-2xl border-l-4 border-persimmon-500 bg-white px-5 py-4 font-medium leading-7 shadow-card">
                AIko adapts using what you practise, reveal, retry, and remember.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 shadow-card">
                  <p className="text-xs font-bold uppercase tracking-wider text-moss-700">Free path</p>
                  <p className="mt-2 text-sm leading-6 text-stone-500">A random, non-repeating lesson from your current level. Profile interests do not affect Free selection.</p>
                </div>
                <div className="rounded-2xl bg-moss-100 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-moss-700">Pro path</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">Level plus interests shape assignments. Your own topic can become a complete saved lesson package.</p>
                </div>
              </div>
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

        <section
          id="lesson-journey"
          className="scroll-mt-20 flex min-h-[calc(100svh-5rem)] items-center bg-white py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
            <div className="max-w-3xl">
              <p className="section-kicker">The lesson journey</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                One lesson. Seven connected stages.
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-500">
                Every phase uses the same lesson context, so vocabulary, grammar, reading,
                listening, and speaking reinforce one another. Japanese is the first language
                to use this system; the structure is designed to support more.
              </p>
            </div>
            <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
              {lessonStages.map(({ number, title, copy, icon: Icon }) => (
                <li
                  key={title}
                  className="relative rounded-3xl border border-black/[.06] bg-paper p-5 lg:min-h-56"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-2xl bg-white text-moss-700 shadow-card">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-bold text-stone-300">{number}</span>
                  </div>
                  <h3 className="mt-6 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-500">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="pricing"
          className="scroll-mt-20 flex min-h-[calc(100svh-5rem)] items-center py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="section-kicker">Free and Pro</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                Begin with structure. Add depth as you grow.
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-500">
                Start with the essentials, then choose Pro when you want more sessions,
                feedback, and lessons built around your interests. Every plan remains
                level-based, and AIko never reassigns the same lesson.
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
                      {plan.primary && <Badge tone="orange">More ways to learn</Badge>}
                    </div>
                    <div className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-1">
                      <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                      {plan.cadence && (
                        <span className={plan.primary ? "pb-1 text-white/60" : "pb-1 text-stone-500"}>
                          {plan.cadence}
                        </span>
                      )}
                    </div>
                    {plan.annual && (
                      <p className={`mt-2 text-sm font-semibold ${plan.primary ? "text-persimmon-400" : "text-moss-700"}`}>
                        {plan.annual}
                      </p>
                    )}
                    <p className={`mt-4 leading-7 ${plan.primary ? "text-white/65" : "text-stone-500"}`}>
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
                        <span className={plan.primary ? "text-white/80" : "text-stone-600"}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <PublicPrimaryAction
                    signedOutLabel={plan.cta}
                    signedInLabel={plan.primary ? "Explore Pro" : "Go to dashboard"}
                    signedInHref={plan.primary ? "/subscription" : "/home"}
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
            <p className="mt-5 text-center text-sm text-stone-400">
              Pro costs ¥2,000 per month or ¥20,000 per year.
            </p>
          </div>
        </section>

        <section
          id="founder"
          className="scroll-mt-20 flex min-h-[calc(100svh-5rem)] items-center bg-white py-16 sm:py-20"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
            <div>
              <p className="section-kicker">Meet the founder</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                Built by Logan, with AI beside him.
              </h2>
              <div className="mt-6 max-w-2xl space-y-4 text-lg leading-8 text-stone-500">
                <p>
                  AIko is being created by Logan, an independent AI researcher
                  and language learner based in Tokyo. While learning Japanese himself, he kept
                  meeting the same problem: lessons, weak points, and progress were scattered,
                  while general AI tutors did not reliably remember what needed more practice.
                </p>
                <p>
                  That frustration became AIko—a structured system where stories, vocabulary,
                  grammar, reading, listening, speaking, and review stay connected. Japanese is
                  the first language because it is the challenge he knows personally, but the
                  platform is being designed to support many languages.
                </p>
                <p>
                  Logan leads the learning design, product direction, experiments, and
                  decisions. AI helps him explore, code, test, and refine the app, turning one
                  person&apos;s idea into a real product while human judgement stays in charge.
                </p>
              </div>
              <p className="mt-6 font-serif text-xl italic text-moss-700">
                Designed from real frustration. Built through human direction and AI collaboration.
              </p>
            </div>
            <div className="rounded-4xl bg-paper p-6 sm:p-9">
              <div className="flex flex-col gap-4" aria-label="About AIko's founder">
                {[
                  {
                    label: "Learning in Japan",
                    copy: "Based in Tokyo and preparing for JLPT N2, he builds around problems he experiences firsthand.",
                    icon: UserRound,
                  },
                  {
                    label: "Independent AI research",
                    copy: "His work explores transformer models, fine-tuning, adaptation, and how AI systems learn.",
                    icon: BrainCircuit,
                  },
                  {
                    label: "Human-led, AI-assisted",
                    copy: "The product vision and decisions stay human; AI helps turn them into a working app.",
                    icon: Sparkles,
                  },
                ].map(({ label, copy, icon: Icon }, index) => (
                  <div key={label}>
                    <div className="flex gap-4 rounded-3xl border border-black/[.06] bg-white p-5 shadow-card">
                      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="font-semibold">{label}</h3>
                        <p className="mt-1 text-sm leading-6 text-stone-500">{copy}</p>
                      </div>
                    </div>
                    {index < 2 && (
                      <ArrowRight
                        className="mx-auto my-2 size-5 rotate-90 text-persimmon-500"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-12 sm:px-8 sm:py-16" aria-labelledby="final-cta-heading">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-4xl bg-persimmon-50 px-6 py-10 text-center sm:px-16 sm:py-12">
            <p className="section-kicker !text-persimmon-600">Your first language awaits</p>
            <h2
              id="final-cta-heading"
              className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"
            >
              Start with Japanese. Grow with AIko.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-stone-500">
              Begin with structured lessons today. As AIko grows, more languages, lesson
              styles, and AI tutors will follow.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <PublicPrimaryAction signedOutLabel="Create your account" className="group" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/[.06] bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <Brand />
            <p className="mt-4 max-w-sm text-sm leading-6 text-stone-500">
              Structured language learning through connected lessons and adaptive review.
              Launching first with Japanese.
            </p>
          </div>
          <nav
            className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-stone-500"
            aria-label="Footer navigation"
          >
            <a className={focusRing} href="#lesson-journey">Learn</a>
            <a className={focusRing} href="#pricing">Pricing</a>
            <a className={focusRing} href="/support">Support</a>
            <a className={focusRing} href="/privacy">Privacy</a>
            <a className={focusRing} href="/terms">Terms</a>
          </nav>
        </div>
        <div className="border-t border-black/[.06]">
          <p className="mx-auto max-w-7xl px-5 py-5 text-xs text-stone-400 sm:px-8">
            © 2026 AIko. Built independently with the help of AI.
          </p>
        </div>
      </footer>
    </div>
  );
}
