"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CircleDollarSign,
  LifeBuoy,
  LockKeyhole,
  MessageCircleQuestion,
  Mic,
  Search,
  Send,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import { FaqList, type FaqItem } from "@/components/support/faq-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const faqs: FaqItem[] = [
  {
    category: "Getting started",
    question: "Where should I begin?",
    answer:
      "Create an account, choose the language and level available to you, and begin with the recommended structured lesson. Japanese is the first supported language.",
  },
  {
    category: "Account access",
    question: "What should I do if I cannot sign in?",
    answer:
      "Check that you are using the correct email address. If you forgot your password, use the password-reset option on the sign-in page and follow the link sent to your email.",
  },
  {
    category: "Lessons",
    question: "Can I leave a lesson and return later?",
    answer:
      "AIko saves supported lesson activity so you can continue your learning journey. If a lesson does not resume correctly, refresh the page and sign in again before starting over.",
  },
  {
    category: "Progress",
    question: "Why does AIko ask me to review something again?",
    answer:
      "AIko uses learning signals such as incorrect answers, revealed help, repeated listening, speaking attempts, and review performance to decide what may need more practice.",
  },
  {
    category: "Voice and speaking",
    question: "Which voice features are available?",
    answer:
      "Speaking and voice-based AI features are being introduced gradually. The lesson will show which controls are currently available; unavailable voice features should not be treated as active.",
  },
  {
    category: "Free and Pro",
    question: "What is included in the Free plan?",
    answer:
      "Free is designed to include structured lessons, limited learning sessions, basic review, progress tracking, limited speaking practice, and standard lesson topics.",
  },
  {
    category: "Free and Pro",
    question: "What is planned for Pro?",
    answer:
      "Pro is planned to include unlimited sessions, lessons about your own topics, voice-based practice, deeper feedback, adaptive review, fuller progress insights, and future premium language experiences.",
  },
  {
    category: "Billing",
    question: "Can I be charged right now?",
    answer:
      "Paid subscriptions have not launched. Pro pricing and payment terms will be shown clearly before any real payment is accepted.",
  },
  {
    category: "Languages",
    question: "Is AIko only for Japanese?",
    answer:
      "No. AIko is launching with Japanese because it is the first learning experience being built and tested, but the platform is designed to support more languages.",
  },
  {
    category: "Privacy",
    question: "What information may AIko store?",
    answer:
      "When the hosted backend is enabled, AIko may store account details, settings, lesson activity, answers, review history, progress, and support conversations needed to provide the service.",
  },
  {
    category: "Technical issues",
    question: "What should I try when a page is not working?",
    answer:
      "Refresh the page once, check your connection, and sign out and back in if the problem continues. Include the page, action, and error you saw when asking support for help.",
  },
];

const topics = [
  {
    label: "Account and access",
    copy: "Sign-in, passwords, privacy, and account questions.",
    icon: LockKeyhole,
  },
  {
    label: "Lessons and progress",
    copy: "Lesson flow, reviews, weak areas, and saved progress.",
    icon: BookOpen,
  },
  {
    label: "Voice and speaking",
    copy: "Microphone access, speaking practice, and voice features.",
    icon: Mic,
  },
  {
    label: "Plans and billing",
    copy: "Free and Pro features, availability, and future payments.",
    icon: CircleDollarSign,
  },
];

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

const initialMessage: ChatMessage = {
  role: "assistant",
  content:
    "Hi, I’m AIko Support. Ask me about accounts, lessons, progress, voice features, plans, billing, languages, or privacy. For now, I answer only from the support information on this page.",
};

function findSupportAnswer(message: string) {
  const normalized = message.trim().toLowerCase();

  if (/^(hi|hello|hey|help)$/.test(normalized)) {
    return "Hello! Tell me what you need help with—your account, a lesson, progress, voice features, plans, billing, languages, privacy, or a technical issue.";
  }

  const words = normalized
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);

  const ranked = faqs
    .map((item) => {
      const searchable = (item.category + " " + item.question + " " + item.answer).toLowerCase();
      const score = words.reduce(
        (total, word) => total + (searchable.includes(word) ? 1 : 0),
        0,
      );
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!ranked[0] || ranked[0].score === 0) {
    return "I don’t have a reliable answer for that in the current support material. Try asking in a different way or search the FAQs. A grounded AI support connection will be added later for broader help.";
  }

  return ranked[0].item.answer;
}

export function SupportPage() {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const filteredFaqs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return faqs;

    return faqs.filter((item) =>
      (item.category + " " + item.question + " " + item.answer)
        .toLowerCase()
        .includes(normalized),
    );
  }, [query]);

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;

    setMessages((current) => [
      ...current,
      { role: "user", content: message },
      { role: "assistant", content: findSupportAnswer(message) },
    ]);
    setDraft("");
  }

  function chooseTopic(label: string) {
    setDraft("I need help with " + label.toLowerCase() + ".");
    window.requestAnimationFrame(() => {
      messageInputRef.current?.scrollIntoView({ block: "center" });
      messageInputRef.current?.focus();
    });
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mx-auto max-w-3xl text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-moss-100 text-moss-700">
          <MessageCircleQuestion className="size-7" aria-hidden="true" />
        </span>
        <p className="section-kicker mt-6">AIko Support</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          How can we help?
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-muted">
          Find clear answers about AIko or ask the support chat. This page is separate from your
          learning dashboard and contains support information only.
        </p>
      </header>

      <section className="mt-10" aria-labelledby="support-topics-heading">
        <div className="flex items-center gap-3">
          <LifeBuoy className="size-5 text-moss-600" aria-hidden="true" />
          <h2 id="support-topics-heading" className="text-xl font-semibold">
            What do you need help with?
          </h2>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {topics.map(({ label, copy, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => chooseTopic(label)}
              className="group rounded-3xl border border-border bg-surface p-5 text-left shadow-card transition duration-180 hover:border-moss-200 hover:shadow-float"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="mt-5 flex items-center justify-between gap-3 font-semibold">
                {label}
                <ArrowRight
                  className="size-4 text-persimmon-500 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </span>
              <span className="mt-2 block text-sm leading-6 text-muted">{copy}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[1fr_.92fr]">
        <section aria-labelledby="faq-heading">
          <div className="flex items-center gap-3">
            <Shield className="size-5 text-moss-600" aria-hidden="true" />
            <h2 id="faq-heading" className="text-2xl font-semibold">
              Frequently asked questions
            </h2>
          </div>
          <label className="relative mt-5 block">
            <Search
              className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <span className="sr-only">Search frequently asked questions</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="form-input min-h-14 pl-12"
              placeholder="Search accounts, lessons, voice, plans, privacy…"
            />
          </label>
          <div className="mt-5">
            <FaqList items={filteredFaqs} />
          </div>
        </section>

        <section aria-labelledby="support-chat-heading">
          <Card className="overflow-hidden p-0 lg:sticky lg:top-24">
            <div className="border-b border-border bg-moss-900 p-5 text-white sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-persimmon-400">
                  <Bot className="size-5" aria-hidden="true" />
                </span>
                <Badge tone="orange">Guided support preview</Badge>
              </div>
              <h2 id="support-chat-heading" className="mt-4 text-2xl font-semibold">
                Ask AIko Support
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Current answers come from the verified support information shown on this page.
              </p>
            </div>

            <div
              className="h-[25rem] space-y-4 overflow-y-auto bg-surface-muted p-5"
              aria-live="polite"
              aria-label="Support conversation"
            >
              {messages.map((message, index) => (
                <div
                  key={message.role + index}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <p
                    className={
                      message.role === "user"
                        ? "max-w-[88%] rounded-3xl rounded-br-lg bg-moss-600 px-4 py-3 text-sm leading-6 text-white"
                        : "max-w-[88%] rounded-3xl rounded-bl-lg bg-surface px-4 py-3 text-sm leading-6 text-muted shadow-card"
                    }
                  >
                    {message.content}
                  </p>
                </div>
              ))}
              <div ref={conversationEndRef} />
            </div>

            <form onSubmit={submitMessage} className="border-t border-border bg-surface p-4">
              <label className="sr-only" htmlFor="support-message">
                Ask AIko Support
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  ref={messageInputRef}
                  id="support-message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={2}
                  className="form-input min-h-12 flex-1 resize-none py-3 text-sm"
                  placeholder="Describe what you need help with…"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-moss-600 text-white transition hover:bg-moss-700 focus:outline-none focus:ring-4 focus:ring-moss-200 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send support message"
                >
                  <Send className="size-4" aria-hidden="true" />
                </button>
              </div>
            </form>

            <div className="flex gap-3 border-t border-border bg-warning-surface px-5 py-4">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-persimmon-600" aria-hidden="true" />
              <p className="text-xs leading-5 text-muted">
                When the AI connection is added, it will answer from approved AIko support
                material and say when that material does not contain a reliable answer.
              </p>
            </div>
          </Card>
        </section>
      </div>

      <section className="mt-12 rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Wrench className="size-5 text-moss-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold">Reporting a technical problem?</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Tell the support chat which page you were using, what you tried, and any error
              message you saw. Do not include passwords or other sensitive credentials.
            </p>
          </div>
          <Badge tone="neutral" className="shrink-0 self-start sm:self-auto">
            <Shield className="mr-1.5 size-3.5" aria-hidden="true" />
            Never share passwords
          </Badge>
        </div>
      </section>
    </main>
  );
}
