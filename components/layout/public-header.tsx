import { Brand } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/button";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.05] bg-paper/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Brand />
        <nav className="hidden items-center gap-8 text-sm font-medium text-stone-600 md:flex" aria-label="Primary navigation">
          <a className="hover:text-ink" href="#method">Method</a>
          <a className="hover:text-ink" href="#features">Features</a>
          <a className="hover:text-ink" href="#pricing">Pricing</a>
          <a className="hover:text-ink" href="#faq">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" className="hidden sm:inline-flex">Log in</ButtonLink>
          <ButtonLink href="/signup" className="min-h-10 px-5">Start learning</ButtonLink>
        </div>
      </div>
    </header>
  );
}
