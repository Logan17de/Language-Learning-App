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
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "AIko — Phone App Coming Soon",
  description:
    "The AIko phone app is coming soon. Learn through connected, adaptive language lessons. The web app will not be available.",
  openGraph: {
    title: "AIko — Phone App Coming Soon",
    description:
      "The AIko phone app is coming soon. The web app will not be available.",
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

const focusRing =
  "rounded-md outline-none transition focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2";

export default function LandingPage() {
  return (
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
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-12 pt-8 sm:px-8 sm:pt-10 lg:grid-cols-[1.04fr_.96fr] lg:gap-12 lg:py-14">
            <div className="animate-fade-up">
              <Badge className="gap-2 py-2">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Phone app coming soon
              </Badge>
              <h1
                id="hero-heading"
                className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.03] tracking-[-0.045em] text-ink sm:text-6xl lg:text-[4.5rem]"
              >
                Your next language,{" "}
                <span className="font-serif font-normal italic text-persimmon-500">
                  in your pocket.
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
                The AIko phone app is coming soon. Explore connected lessons, speaking
                practice, and personalised guidance in one learning experience.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
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
                The web app will not be available.
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
          className="scroll-mt-20 bg-white py-12 sm:py-16"
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

        <section className="py-12 sm:py-16" aria-labelledby="adapt-heading">
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
          className="scroll-mt-20 bg-white py-12 sm:py-16"
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
          id="founder"
          className="scroll-mt-20 bg-white py-12 sm:py-16"
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

        <section id="app-availability" className="scroll-mt-20 px-5 py-10 sm:px-8 sm:py-12" aria-labelledby="availability-heading">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-4xl bg-persimmon-50 px-6 py-8 text-center sm:px-16 sm:py-10">
            <p className="section-kicker !text-persimmon-600">Coming soon</p>
            <h2
              id="availability-heading"
              className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"
            >
              AIko is coming to your phone.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-stone-500">
              The phone app is coming soon. The web app will not be available.
              Explore how AIko connects your learning while we prepare the phone app.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/[.06] bg-white">
        <div className="mx-auto flex max-w-7xl justify-end px-5 py-6 sm:px-8">
          <nav
            className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-stone-500"
            aria-label="Footer navigation"
          >
            <a className={focusRing} href="#lesson-journey">How lessons work</a>
            <a className={focusRing} href="#app-availability">Phone app</a>
            <a className={focusRing} href="/privacy">Privacy</a>
            <a className={focusRing} href="/terms">Terms</a>
          </nav>
        </div>
        <div className="border-t border-black/[.06]">
          <p className="mx-auto max-w-7xl px-5 py-4 text-xs text-stone-400 sm:px-8">
            © 2026 AIko. Built independently with the help of AI.
          </p>
        </div>
      </footer>
    </div>
  );
}
