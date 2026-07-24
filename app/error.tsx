"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-6 text-center">
      <div>
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-persimmon-100 text-persimmon-600"><AlertTriangle className="size-7" /></span>
        <h1 className="mt-7 text-3xl font-semibold">Something interrupted the lesson.</h1>
        <p className="mt-3 text-stone-500">Your local progress is safe. Try loading this screen again.</p>
        <Button onClick={reset} className="mt-7">Try again</Button>
      </div>
    </main>
  );
}
