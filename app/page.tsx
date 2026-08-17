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
  Languages,
  Lightbulb,
  Mic,
  Sparkles,
  UserRound,
} from "lucide-react";
import { PublicPrimaryAction } from "@/components/auth/public-auth-actions";
import { PublicHeader } from "@/components/layout/public-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "AIko — Adaptive Language Learning",
  description:
    "Learn Japanese through one level-matched story lesson at a time: Story, Vocabulary + Kanji, Grammar, Reading, Listening, and Speaking. Mastery updates automatically from practice.",
  openGraph: {
    title: "AIko — Adaptive Language Learning",
    description:
      "Six connected Japanese lesson phases, adaptive grammar translation, and automatic mastery that helps shape what comes next.",
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
    title: "AIko chooses one next lesson",
    copy: "You receive one level-matched assignment instead of browsing a lesson catalog. Premium learners can also use their interests to rank suitable lessons.",
    icon: BrainCircuit,
  },
  {
    number: "02",
    title: "Start with one connected story",
    copy: "The story introduces the situation, vocabulary, kanji, and grammar that the rest of the lesson will keep reusing.",
    icon: BookOpenText,
  },
  {
    number: "03",
    title: "Reuse the same language six ways",
    copy: "Story, Vocabulary + Kanji, Grammar, Reading, Listening, and Speaking reinforce the same lesson context instead of behaving like separate exercises.",
    icon: Languages,
  },
  {
    number: "04",
    title: "Produce Japanese in Grammar",
    copy: "After grammar practice, adaptive English-to-Japanese translation asks you to actively use the lesson grammar plus reinforcement patterns when available.",
    icon: Lightbulb,
  },
  {
    number: "05",
    title: "Mastery updates automatically",
    copy: "Answers, reveals, translations, listening activity, and speaking attempts become learning evidence in the background. There is no separate Review stage to complete.",
    icon: Check,
  },
  {
    number: "06",
    title: "What you do shapes what comes next",
    copy: "Your level and learning evidence guide future targeting. Once a lesson has been started, it does not return as your next assigned lesson.",
    icon: Sparkles,
  },
];

const lessonStages: Array<{
  number: string;
  title: string;
  copy: string;
  icon: LucideIcon;
}> = [
  {
    number: "01",
    title: "Story",
    copy: "Understand the lesson situation and meet the target language in context.",
    icon: BookOpenText,
  },
  {
    number: "02",
    title: "Vocabulary + Kanji",
    copy: "Practise the useful words and focus kanji that appear in the lesson.",
    icon: Languages,
  },
  {
    number: "03",
    title: "Grammar",
    copy: "Learn the target patterns, answer grammar questions, then use Japanese in adaptive translation practice.",
    icon: Lightbulb,
  },
  {
    number: "04",
    title: "Reading",
    copy: "Recognise the same language again in text and answer from meaning and context.",
    icon: Eye,
  },
  {
    number: "05",
    title: "Listening",
    copy: "Follow the lesson language in audio and build recognition without changing topics.",
    icon: Ear,
  },
  {
    number: "06",
    title: "Speaking",
    copy: "Use the microphone to turn familiar lesson language into spoken Japanese.",
    icon: Mic,
  },
];

const learningSignals = [
  "Vocabulary + kanji answers",
  "Grammar practice answers",
  "AI-validated translations",
  "Reading responses",
  "Listening activity",
  "Speaking attempts",
];

const plans = [
  {
    name: "Free",
    copy: "The core AIko learning path for Japanese.",
    features: [
      "Core six-phase Japanese lessons",
      "Level-matched lesson assignment",
      "Automatic mastery and progress tracking",
      "Grammar translation inside the lesson flow",
      "Assigned lessons stay out of rotation once started",
    ],
    price: "¥0",
    cadence: "",
    annual: null,
    cta: "Start Free",
    primary: false,
  },
  {
    name: "Premium",
    copy: "More control over lesson selection, generation, speaking, and learning insights.",
    features: [
      "Interest-based lesson recommendations",
      "Custom-topic AI lesson generation",
      "Unlimited adaptive lesson access",
      "Extended speaking practice",
      "Deeper progress analytics",
    ],
    price: "¥2,000",
    cadence: "/ month",
    annual: "¥20,000 / year",
    cta: "Explore Premium",
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
                One story. Six connected phases. Adaptive mastery.
              </Badge>
              <h1
                id="hero-heading"
                className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.03] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[4.5rem]"
              >
                Learn Japanese through lessons that{" "}
                <span className="font-serif font-normal italic text-persimmon-500">
                  build on each other.
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
                AIko gives you one level-matched lesson at a time. A single story becomes
                Vocabulary + Kanji, Grammar, Reading, Listening, and Speaking practice, while
                your activity updates mastery automatically and helps shape what comes next.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <PublicPrimaryAction
                  signedOutLabel="Start learning"
                  hideWhenSignedIn
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
                Currently focused on Japanese.
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
                      The current AIko lesson
                    </span>
                    <Badge tone="orange">6 phases</Badge>
                  </div>
                  <h2 className="mt-5 max-w-sm text-2xl font-semibold leading-tight sm:text-3xl">
                    One lesson context, reused until you can understand and produce it.
                  </h2>
                  <div className="mt-6 grid grid-cols-2 gap-2.5">
                    {[
                      { label: "Story", icon: BookOpenText },
                      { label: "Vocabulary + Kanji", icon: Languages },
                      { label: "Grammar + Translation", icon: Lightbulb },
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
                    <p className="text-sm font-semibold text-ink">Mastery stays in the background</p>
                    <p className="text-xs leading-5 text-stone-500">
                      No separate Review stage is required after the lesson.
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
              <p className="section-kicker">The current learning loop</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                AIko chooses the lesson. Your practice shapes the path.
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-500">
                Learners do not browse a catalog for the next standard lesson. AIko assigns one
                suitable lesson, keeps its language connected across all six phases, records
                learning evidence automatically, and uses that evidence for future targeting.
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
                Mastery comes from what you actually do.
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-8 text-stone-500">
                AIko uses evidence created inside the lesson to update progress and help target
                future lessons. Mastery is recorded automatically instead of being presented as
                a separate learner-facing Review phase.
              </p>
              <p className="mt-5 max-w-xl rounded-2xl border-l-4 border-persimmon-500 bg-white px-5 py-4 font-medium leading-7 shadow-card">
                Grammar also includes adaptive English-to-Japanese translation, so production
                can contribute evidence instead of relying only on recognition questions.
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

        <section
          id="lesson-journey"
          className="scroll-mt-20 flex min-h-[calc(100svh-5rem)] items-center bg-white py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
            <div className="max-w-3xl">
              <p className="section-kicker">The lesson journey</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                One lesson. Six connected phases.
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-500">
                Every phase keeps the same story context. Grammar contains its own adaptive
                translation practice, so Translation is part of Grammar rather than a seventh
                phase. Standalone Review is not part of the learner journey.
              </p>
            </div>
            <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {lessonStages.map(({ number, title, copy, icon: Icon }) => (
                <li
                  key={title}
                  className="relative rounded-3xl border border-black/[.06] bg-paper p-5 xl:min-h-64"
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
            <div className="mt-6 rounded-3xl border border-persimmon-100 bg-persimmon-50 px-5 py-4 text-sm leading-6 text-stone-600 sm:px-6">
              <strong className="text-ink">One-sitting rule:</strong> a lesson does not pause for
              later. If you leave after starting, that attempt ends and the lesson will not be
              surfaced again as your next assignment. Learning evidence already recorded stays saved.
            </div>
          </div>
        </section>

        <section
          id="pricing"
          className="scroll-mt-20 flex min-h-[calc(100svh-5rem)] items-center py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="section-kicker">Free and Premium</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                Keep the core path. Add more control with Premium.
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-500">
                Free keeps the core six-phase learning path. Premium adds the capabilities that
                the current subscription screen actually unlocks: interest-shaped lesson
                recommendations, custom-topic generation, extended speaking, and deeper insights.
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
                      {plan.primary && <Badge tone="orange">Current Premium model</Badge>}
                    </div>
                    <div className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-1">
                      <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                      {plan.cadence && (
                        <span
                          className={
                            plan.primary ? "pb-1 text-white/60" : "pb-1 text-stone-500"
                          }
                        >
                          {plan.cadence}
                        </span>
                      )}
                    </div>
                    {plan.annual && (
                      <p
                        className={`mt-2 text-sm font-semibold ${
                          plan.primary ? "text-persimmon-400" : "text-moss-700"
                        }`}
                      >
                        {plan.annual}
                      </p>
                    )}
                    <p
                      className={`mt-4 leading-7 ${
                        plan.primary ? "text-white/65" : "text-stone-500"
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
                        <span className={plan.primary ? "text-white/80" : "text-stone-600"}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <PublicPrimaryAction
                    signedOutLabel={plan.cta}
                    signedInLabel={plan.primary ? "Explore Premium" : "Go to dashboard"}
                    signedInHref={plan.primary ? "/subscription" : "/home"}
                    hideWhenSignedIn={!plan.primary}
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
            <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-stone-400">
              Premium checkout is not connected yet, so the app cannot charge you from the
              subscription page today. The current planned options are ¥2,000/month or
              ¥20,000/year; beta Premium access can be assigned administratively.
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
                  AIko is being created by Logan, an independent AI researcher and language
                  learner in Japan. While learning Japanese himself, he kept meeting the same
                  problem: lessons, weak points, and progress were scattered, while general AI
                  tutors did not reliably remember what needed more practice.
                </p>
                <p>
                  That frustration became AIko: one story reused through Story, Vocabulary +
                  Kanji, Grammar, Reading, Listening, and Speaking, with learning evidence and
                  mastery recorded automatically instead of adding a separate Review stage.
                </p>
                <p>
                  Logan leads the learning design, product direction, experiments, and
                  decisions. AI helps him explore, code, test, and refine the app, turning one
                  person&apos;s idea into a working product while human judgement stays in charge.
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
                    label: "Learning Japanese in Japan",
                    copy: "The product is shaped around problems its founder experiences while learning the language himself.",
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
            <p className="section-kicker !text-persimmon-600">Your next Japanese lesson</p>
            <h2
              id="final-cta-heading"
              className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"
            >
              One story. Six phases. One adaptive path.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-stone-500">
              Begin with one level-matched lesson. AIko keeps the language connected across the
              whole lesson and uses what you do to help shape what comes next.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <PublicPrimaryAction
                signedOutLabel="Create your account"
                hideWhenSignedIn
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
