import {
  ArrowRight,
  AudioLines,
  BookOpenText,
  BrainCircuit,
  Check,
  ChevronRight,
  CirclePlay,
  MessageCircleMore,
  RefreshCw,
  Sparkles,
  Volume2,
} from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brand } from "@/components/ui/brand";

const lessonSteps = [
  { n: "01", title: "Meet it in a story", copy: "Natural Japanese first, with support when you need it.", icon: BookOpenText },
  { n: "02", title: "Make it yours", copy: "Recognize, read, listen, and speak in one connected lesson.", icon: AudioLines },
  { n: "03", title: "Recall without hints", copy: "A final retrieval check shows what really stuck.", icon: BrainCircuit },
];

const faqs = [
  ["Is AIko a chatbot?", "No. AIko is a structured learning path built from reusable lesson packages. You always know what you’re learning and why."],
  ["What level is it for?", "The prototype supports beginner through N2 onboarding, with the first complete sample lesson designed around N4 material."],
  ["Do I need to speak out loud?", "Reading aloud is recommended, but always learner-controlled. The prototype explains the feature before it appears in lessons."],
  ["How does adaptation work?", "The app records mock learning signals such as difficult words and review results, then surfaces them in future practice."],
];

export default function LandingPage() {
  return (
    <div className="overflow-hidden bg-paper">
      <PublicHeader />
      <main>
        <section className="relative">
          <div className="absolute inset-x-0 top-0 -z-0 h-[38rem] bg-[radial-gradient(circle_at_75%_20%,rgba(229,119,72,.13),transparent_36%),radial-gradient(circle_at_20%_10%,rgba(79,128,104,.14),transparent_32%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:py-28">
            <div className="animate-fade-up">
              <Badge className="gap-2 py-2">
                <Sparkles className="size-3.5" />
                Learning that notices the hard parts
              </Badge>
              <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] text-ink sm:text-6xl lg:text-7xl">
                Japanese lessons that adapt to your{" "}
                <span className="font-serif font-normal italic text-persimmon-500">real difficulties.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-stone-600">
                Learn through connected stories, vocabulary, grammar, reading, listening, and speaking—then review exactly what needs another look.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/signup" className="group px-7">
                  Start learning free
                  <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                </ButtonLink>
                <a href="#method" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-ink hover:bg-white">
                  <CirclePlay className="size-5 text-persimmon-500" />
                  See how lessons work
                </a>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-stone-500">
                {["No credit card", "10-minute first session", "Built for consistency"].map((text) => (
                  <span key={text} className="flex items-center gap-2">
                    <Check className="size-4 text-moss-600" />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:mr-0">
              <div className="absolute -left-8 top-20 size-32 rounded-full bg-persimmon-100 blur-2xl" />
              <div className="relative animate-float-slow rounded-[2.5rem] border border-white bg-white/80 p-3 shadow-float backdrop-blur">
                <div className="rounded-[2rem] bg-moss-900 p-6 text-white">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[.18em] text-moss-200">Today’s lesson</span>
                    <Badge tone="orange">N4 · 30 min</Badge>
                  </div>
                  <p className="mt-7 font-serif text-3xl">会社へ行く朝</p>
                  <p className="mt-1 text-sm text-white/60">Going to Work</p>
                  <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[42%] rounded-full bg-persimmon-400" />
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-white/50">
                    <span>Story</span>
                    <span>3 of 7 phases</span>
                  </div>
                </div>
                <div className="grid gap-3 p-3 pt-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-moss-50 p-5">
                    <p className="text-xs font-semibold text-moss-600">Grammar in context</p>
                    <p className="mt-3 text-2xl font-semibold">〜ながら</p>
                    <p className="mt-1 text-xs text-stone-500">while doing</p>
                  </div>
                  <div className="rounded-3xl bg-persimmon-50 p-5">
                    <p className="text-xs font-semibold text-persimmon-600">Needs another look</p>
                    <p className="mt-3 text-2xl font-semibold">改札</p>
                    <p className="mt-1 text-xs text-stone-500">かいさつ · ticket gate</p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-5 rounded-2xl border border-white bg-white p-4 shadow-card sm:-left-12">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-moss-100 text-moss-700">
                    <RefreshCw className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-stone-400">Review updated</p>
                    <p className="text-sm font-semibold">2 words added</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="method" className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="section-kicker">One lesson, one connected journey</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Context before memorization.</h2>
              <p className="mt-5 text-lg leading-8 text-stone-500">Every skill draws from the same story, so new Japanese feels connected instead of scattered.</p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {lessonSteps.map(({ n, title, copy, icon: Icon }) => (
                <Card key={title} className="group relative overflow-hidden p-7 transition hover:-translate-y-1 hover:shadow-float">
                  <span className="absolute right-5 top-3 font-serif text-7xl text-moss-50">{n}</span>
                  <span className="relative grid size-12 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="relative mt-8 text-xl font-semibold">{title}</h3>
                  <p className="relative mt-3 leading-7 text-stone-500">{copy}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-2">
            <div className="rounded-4xl bg-moss-900 p-8 text-white sm:p-12">
              <p className="section-kicker !text-moss-200">Adaptive, not distracting</p>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold tracking-tight">The lesson changes where your attention goes next.</h2>
              <p className="mt-5 max-w-lg leading-7 text-white/65">A pause before a word, a revealed reading, or a missed retrieval becomes a gentle signal—not a permanent label.</p>
              <div className="mt-10 space-y-4">
                {[
                  ["改札", "Reading revealed twice", "Review soon"],
                  ["〜ので", "Strong in recognition", "Practice production"],
                  ["一緒に", "Confident today", "Space review"],
                ].map(([term, note, action]) => (
                  <div key={term} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl bg-white/10 p-4">
                    <span className="text-xl font-semibold">{term}</span>
                    <span className="text-sm text-white/55">{note}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{action}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                [BookOpenText, "Read with support", "Tap a word only when you need its reading or meaning."],
                [Volume2, "Listen for meaning", "Replay naturally, then reveal the transcript after answering."],
                [MessageCircleMore, "Speak at your level", "Move from a complete model to a free response."],
                [RefreshCw, "Lessons you can reuse", "Return to the same package with a new review focus."],
              ].map(([Icon, title, copy]) => {
                const FeatureIcon = Icon as typeof BookOpenText;
                return (
                  <Card key={title as string} className="flex flex-col justify-between p-7">
                    <FeatureIcon className="size-7 text-persimmon-500" />
                    <div className="mt-10">
                      <h3 className="text-lg font-semibold">{title as string}</h3>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{copy as string}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-white py-24">
          <div className="mx-auto max-w-5xl px-5 sm:px-8">
            <div className="text-center">
              <p className="section-kicker">Simple plans</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight">Start with structure. Add depth when you want it.</h2>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {[
                { name: "Free", price: "¥0", copy: "Build a dependable study habit.", features: ["Structured JLPT lessons", "Daily lesson allowance", "Basic progress tracking", "Limited speaking practice"], primary: false },
                { name: "Premium", price: "¥1,480", copy: "Make every lesson fit your world.", features: ["Custom-topic lesson requests", "Unlimited adaptive lessons", "Expanded speaking practice", "Deeper progress analytics"], primary: true },
              ].map((plan) => (
                <Card key={plan.name} className={plan.primary ? "border-moss-700 bg-moss-900 p-8 text-white" : "p-8"}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-semibold">{plan.name}</h3>
                    {plan.primary && <Badge tone="orange">Most flexible</Badge>}
                  </div>
                  <p className="mt-6 text-4xl font-semibold">{plan.price}<span className="text-sm font-normal opacity-55"> / month</span></p>
                  <p className="mt-3 text-sm opacity-60">{plan.copy}</p>
                  <ul className="mt-8 space-y-4 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3">
                        <Check className={plan.primary ? "size-4 text-persimmon-400" : "size-4 text-moss-600"} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <ButtonLink href="/signup" variant={plan.primary ? "primary" : "secondary"} className={plan.primary ? "mt-9 w-full bg-persimmon-500 hover:bg-persimmon-600" : "mt-9 w-full"}>
                    Choose {plan.name}
                  </ButtonLink>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="py-24">
          <div className="mx-auto grid max-w-5xl gap-12 px-5 sm:px-8 lg:grid-cols-[.75fr_1.25fr]">
            <div>
              <p className="section-kicker">Questions, answered</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight">A clearer way to learn.</h2>
            </div>
            <div className="space-y-3">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group rounded-3xl border border-black/[.06] bg-white p-5 open:shadow-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {question}
                    <ChevronRight className="size-5 shrink-0 text-moss-600 transition group-open:rotate-90" />
                  </summary>
                  <p className="mt-4 pr-8 text-sm leading-7 text-stone-500">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-4xl bg-persimmon-50 p-8 text-center sm:p-16">
            <p className="font-serif text-5xl text-persimmon-500">今日から</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-tight">Your next Japanese lesson is ready.</h2>
            <p className="mx-auto mt-4 max-w-lg text-stone-500">Ten focused minutes is enough to begin. AIko will help you decide what comes next.</p>
            <ButtonLink href="/signup" className="mt-8">Start learning <ArrowRight className="size-4" /></ButtonLink>
          </div>
        </section>
      </main>
      <footer className="border-t border-black/[.06] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Brand />
          <p className="text-sm text-stone-400">© 2026 AIko Learning. Prototype experience.</p>
          <div className="flex gap-6 text-sm text-stone-500">
            <a href="#faq">Help</a>
            <a href="#pricing">Plans</a>
            <a href="/login">Log in</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
