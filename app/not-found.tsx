import { BookOpenText } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-6 text-center">
      <div>
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-moss-100 text-moss-700"><BookOpenText className="size-7" /></span>
        <p className="section-kicker mt-8">404 · Page not found</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">This lesson path has moved.</h1>
        <p className="mx-auto mt-3 max-w-md text-stone-500">Return home and continue with the recommended lesson waiting for you.</p>
        <ButtonLink href="/home" className="mt-8">Return home</ButtonLink>
      </div>
    </main>
  );
}
