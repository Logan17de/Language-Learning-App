import type { Metadata } from "next";
import { Brand } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/button";
import { AIKO_SUPPORT_EMAIL, AIKO_SUPPORT_MAILTO } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How AIko handles account and learning information during early access.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Brand />
        <article className="mt-10 rounded-4xl border border-black/[.06] bg-white p-7 shadow-card sm:p-12">
          <p className="section-kicker">Public information</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Privacy at AIko</h1>
          <p className="mt-5 leading-8 text-stone-500">
            AIko is an independently built product in early access. This page explains the
            information the current product may use to provide lessons and track learning.
          </p>
          <div className="mt-9 space-y-8">
            <section>
              <h2 className="text-xl font-semibold">Account and learning data</h2>
              <p className="mt-3 leading-7 text-stone-500">
                When the hosted backend is enabled, AIko may store account details, settings,
                lesson activity, answers, review history, progress, and support requests. Demo
                mode stores its sample state in your browser.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold">Microphone access</h2>
              <p className="mt-3 leading-7 text-stone-500">
                Speaking features request microphone permission only when you choose to use
                them. Available controls depend on the current lesson and browser.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold">Questions and requests</h2>
              <p className="mt-3 leading-7 text-stone-500">
                For privacy questions, stored-information requests, or account-access help, email{" "}
                <a className="font-semibold text-moss-700 hover:underline" href={AIKO_SUPPORT_MAILTO}>
                  {AIKO_SUPPORT_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </article>
        <ButtonLink href="/" variant="secondary" className="mt-8">Return to AIko</ButtonLink>
      </div>
    </main>
  );
}
