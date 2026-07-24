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
import { PublicHeader } from "@/components/layout/public-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
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
    title: "Improve what comes next",
    copy: "Your practice history helps future lessons and reviews focus attention more usefully.",
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
      "Access to standard lesson topics",
    ],
    cta: "Start Free",
    primary: false,
  },
  {
    name: "Pro",
    copy: "More freedom, feedback, and continuity as you grow.",
    features: [
      "Unlimited learning sessions",
      "Request lessons about your own topics",
      "Personalised lesson recommendations",
      "Voice-based speaking practice",
      "Advanced reading and pronunciation feedback",
      "Adaptive review and learner memory",
      "Full progress insights",
      "Future languages and premium tutors when available",
    ],
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
            className="absolute inset-x-0 top-0 -z-10 h-[46rem] bg-[radial-gradient(circle_at_78%_20%,rgba(229,119,72,.16),transparent_34%),radial-gradient(circle_at_18%_14%,rgba(79,128,104,.17),transparent_30%)]"
            aria-hidden="true"
          />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.04fr_.96fr] lg:gap-16 lg:py-28">
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
              <p className="mt-7 max-w-2xl text-lg leading-8 text-stone-600">
                AIko combines structured lessons, speaking practice, review, and personalised
                guidance in one learning experience. Japanese is only the beginning.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/signup" className="group px-7">
                  Start learning
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </ButtonLink>
                <a
                  href="#learning-system"
                  className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-ink hover:bg-white ${focusRing}`}
                >
                  <CirclePlay className="size-5 text-persimmon-500" aria-hidden="true" />
                  See how it works
                </a>
              </div>
              <p className="mt-7 flex items-center gap-2 text-sm font-medium text-stone-500">
                <span className="size-2 rounded-full bg-persimmon-500" aria-hidden="true" />
                Currently launching with Japanese.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-xl lg:mr-0">
              <div
                className="absolute -left-8 top-20 size-32 rounded-full bg-persimmon-100 blur-2xl"
                aria-hidden="true"
              />
              <div className="relative animate-float-slow rounded-[2.5rem] border border-white bg-white/85 p-3 shadow-float backdrop-blur">
                <div className="rounded-[2rem] bg-moss-900 p-6 text-white sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[.18em] text-moss-200">
                      Japanese launch preview
                    </span>
                    <Badge tone="orange">Connected lesson</Badge>
                  </div>
                  <div className="mt-7 rounded-3xl bg-white/10 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-white/50">
                      Story context
                    </p>
                    <p className="mt-3 font-serif text-2xl sm:text-3xl">
                      会社へ行く朝
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/65">
                      A morning commute becomes the shared context for every activity.
                    </p>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {["Story", "Meaning", "Sound", "Expression"].map((item) => (
                      <span
                        key={item}
                        className="rounded-2xl bg-white/[.08] px-3 py-3 text-center text-xs font-semibold text-white/75"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 p-3 pt-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-moss-50 p-5">
                    <p className="text-xs font-semibold text-moss-600">Grammar in context</p>
                    <p className="mt-3 text-2xl font-semibold">〜ながら</p>
                    <p className="mt-1 text-xs text-stone-500">while doing</p>
                  </div>
                  <div className="rounded-3xl bg-persimmon-50 p-5">
                    <p className="text-xs font-semibold text-persimmon-600">Vocabulary support</p>
                    <p className="mt-3 text-2xl font-semibold">改札</p>
                    <p className="mt-1 text-xs text-stone-500">かいさつ · ticket gate</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="learning-system" className="scroll-mt-24 bg-white py-24 sm:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="section-kicker">A connected learning loop</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                More than lessons. A learning system.
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-500">
                Each activity builds on the one before it. What you practise, reveal, retry,
                and remember helps AIko decide where your attention may be most useful next.
              </p>
            </div>
            <ol className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {learningFlow.map(({ number, title, copy, icon: Icon }) => (
                <li key={title}>
                  <Card className="group relative h-full overflow-hidden p-7 transition hover:-translate-y-1 hover:shadow-float">
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

        <section className="py-24 sm:py-28" aria-labelledby="adapt-heading">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <p className="section-kicker">Adaptation grounded in practice</p>
              <h2
                id="adapt-heading"
                className="mt-4 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl"
              >
                Guidance based on what you actually do.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-stone-500">
                AIko does not guess what you are thinking. It uses learning evidence from the
                lesson to shape review and future recommendations.
              </p>
              <p className="mt-7 max-w-xl rounded-2xl border-l-4 border-persimmon-500 bg-white px-5 py-4 font-medium leading-7 shadow-card">
                AIko adapts using what you practise, reveal, retry, and remember.
              </p>
            </div>
            <div className="rounded-4xl bg-moss-900 p-7 text-white sm:p-10">
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

        <section id="lesson-journey" className="scroll-mt-24 bg-white py-24 sm:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
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
            <ol className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
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

        <section id="pricing" className="scroll-mt-24 py-24 sm:py-28">
          <div className="mx-auto max-w-5xl px-5 sm:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="section-kicker">Free and Pro</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                Begin with structure. Add depth as you grow.
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-500">
                Start with the essentials, then choose Pro when you want more sessions,
                feedback, and lessons built around your interests.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
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
                  <ButtonLink
                    href="/signup"
                    variant={plan.primary ? "primary" : "secondary"}
                    className={
                      plan.primary
                        ? "mt-9 w-full bg-persimmon-500 hover:bg-persimmon-600"
                        : "mt-9 w-full"
                    }
                  >
                    {plan.cta}
                  </ButtonLink>
                </Card>
              ))}
            </div>
            <p className="mt-5 text-center text-sm text-stone-400">
              Pro pricing will be shared before paid subscriptions launch.
            </p>
          </div>
        </section>

        <section id="founder" className="scroll-mt-24 bg-white py-24 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
            <div>
              <p className="section-kicker">Built differently</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                One person, many AI collaborators.
              </h2>
              <div className="mt-7 max-w-2xl space-y-5 text-lg leading-8 text-stone-500">
                <p>
                  AIko is being built by an independent creator who wanted a better way to
                  learn languages—one where stories, vocabulary, grammar, reading, listening,
                  speaking, and review all work together.
                </p>
                <p>
                  Instead of starting with a large company or development team, the product is
                  being designed and built by one person working alongside AI. The ideas,
                  learning structure, experiments, and decisions come from a human. AI helps
                  turn those ideas into a working product.
                </p>
                <p>
                  AIko itself is proof of the idea behind the platform: a person can achieve
                  more when AI becomes a thoughtful collaborator, not a replacement.
                </p>
              </div>
              <p className="mt-8 font-serif text-xl italic text-moss-700">
                Designed by a learner. Built with AI. Made for people who want to keep growing.
              </p>
            </div>
            <div className="rounded-4xl bg-paper p-6 sm:p-9">
              <div className="flex flex-col gap-4" aria-label="How AIko is built">
                {[
                  {
                    label: "Human idea",
                    copy: "A learner identifies a better way to connect the learning journey.",
                    icon: UserRound,
                  },
                  {
                    label: "AI-assisted creation",
                    copy: "AI helps explore, build, test, and refine the idea.",
                    icon: Sparkles,
                  },
                  {
                    label: "Real working product",
                    copy: "The result becomes something people can use and improve with.",
                    icon: Languages,
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

        <section className="px-5 py-20 sm:px-8 sm:py-24" aria-labelledby="final-cta-heading">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-4xl bg-persimmon-50 px-6 py-14 text-center sm:px-16 sm:py-16">
            <p className="section-kicker !text-persimmon-600">Your first language awaits</p>
            <h2
              id="final-cta-heading"
              className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"
            >
              Start with Japanese. Grow with AIko.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-stone-500">
              Begin with structured lessons today. As AIko grows, more languages, lesson
              styles, and AI tutors will follow.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/signup" className="group">
                Create your account
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary">
                Sign in
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/[.06] bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1fr_auto] md:items-end">
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
            <a className={focusRing} href="/login">Sign in</a>
          </nav>
        </div>
        <div className="border-t border-black/[.06]">
          <p className="mx-auto max-w-7xl px-5 py-6 text-xs text-stone-400 sm:px-8">
            © 2026 AIko. Built independently with the help of AI.
          </p>
        </div>
      </footer>
    </div>
  );
}
