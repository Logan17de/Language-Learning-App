import type { Metadata } from "next";
import { Brand } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How AIko handles account and learning information during early access.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Brand />
        <article className="mt-10 rounded-4xl border border-border bg-surface p-7 shadow-card sm:p-12">
          <p className="section-kicker">Public information</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Privacy at AIko</h1>
          <p className="mt-5 leading-8 text-muted">
            AIko is an independently built product in early access. This page explains the
            information the current product may use to provide lessons and track learning.
          </p>
          <div className="mt-9 space-y-8">
            <section>
              <h2 className="text-xl font-semibold">Account and learning data</h2>
              <p className="mt-3 leading-7 text-muted">
                When the hosted backend is enabled, AIko may store account details, settings,
                lesson activity, answers, review history, progress, and support requests. Demo
                mode stores its sample state in your browser.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold">Microphone access</h2>
              <p className="mt-3 leading-7 text-muted">
                Speaking features request microphone permission only when you choose to use
                them. Available controls depend on the current lesson and browser.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold">Questions and requests</h2>
              <p className="mt-3 leading-7 text-muted">
                Use the in-app support page for questions about stored information or account
                access. This notice will be expanded as production services are introduced.
              </p>
            </section>
          </div>
        </article>
        <ButtonLink href="/" variant="secondary" className="mt-8">Return to AIko</ButtonLink>
      </div>
    </main>
  );
}
