import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SupportPage } from "@/components/support/support-page";
import { Brand } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/button";
import { AIKO_SUPPORT_EMAIL, AIKO_SUPPORT_MAILTO } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Support",
  description: "Find AIko help, browse frequently asked questions, and contact support.",
};

export default function SupportRoute() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-black/[.06] bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <ButtonLink href="/" variant="ghost" className="min-h-10 px-4">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to AIko
          </ButtonLink>
        </div>
      </header>

      <SupportPage />

      <footer className="border-t border-black/[.06] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            Need more help? Email{" "}
            <a className="font-semibold text-moss-700 hover:underline" href={AIKO_SUPPORT_MAILTO}>
              {AIKO_SUPPORT_EMAIL}
            </a>
          </p>
          <div className="flex gap-5">
            <a className="hover:text-ink" href="/privacy">
              Privacy
            </a>
            <a className="hover:text-ink" href="/terms">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
