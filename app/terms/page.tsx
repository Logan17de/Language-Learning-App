import type { Metadata } from "next";
import { Brand } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Terms",
  description: "Early-access terms for using the AIko language learning application.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Brand />
        <article className="mt-10 rounded-4xl border border-black/[.06] bg-white p-7 shadow-card sm:p-12">
          <p className="section-kicker">Early access</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Terms of use</h1>
          <p className="mt-5 leading-8 text-stone-500">
            AIko is an evolving language-learning product. By using the current early-access
            experience, you agree to use it responsibly and understand that features may change.
          </p>
          <div className="mt-9 space-y-8">
            <section>
              <h2 className="text-xl font-semibold">Learning guidance</h2>
              <p className="mt-3 leading-7 text-stone-500">
                Lessons and feedback are educational aids, not a guarantee of fluency,
                certification, examination results, or professional translation accuracy.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold">Accounts and acceptable use</h2>
              <p className="mt-3 leading-7 text-stone-500">
                Keep account credentials secure and do not misuse the service, interfere with
                other learners, attempt unauthorised access, or submit unlawful material.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-semibold">Plans and availability</h2>
              <p className="mt-3 leading-7 text-stone-500">
                Free and Pro describe the intended product tiers. Paid subscriptions are not
                offered until pricing and payment terms are published in the product.
              </p>
            </section>
          </div>
        </article>
        <ButtonLink href="/" variant="secondary" className="mt-8">Return to AIko</ButtonLink>
      </div>
    </main>
  );
}
