import { Check, LockKeyhole, MapPin, Mountain, Trees, Torus, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";

const regions = [
  { name: "Lantern Village", detail: "Foundations", icon: MapPin },
  { name: "Whispering Forest", detail: "Everyday speech", icon: Trees },
  { name: "Mist Mountain", detail: "Connected stories", icon: Mountain },
  { name: "Moonstone Temple", detail: "Fluency trials", icon: Torus },
  { name: "Summit Archive", detail: "Mastery", icon: Waypoints },
];

export function WorldJourney({ progress }: { progress: number }) {
  const activeIndex = Math.min(regions.length - 1, Math.floor(progress / 20));

  return (
    <section className="relative min-h-[30rem] overflow-hidden rounded-[2rem] border border-white/15 bg-moss-900 text-white shadow-float" aria-labelledby="journey-title">
      <div className="absolute inset-0 bg-[url('/images/aiko-world-map.png')] bg-cover bg-center" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-t from-moss-900 via-moss-900/20 to-moss-900/45" aria-hidden="true" />
      <div className="relative flex min-h-[30rem] flex-col justify-between p-6 sm:p-8">
        <header className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[.22em] text-persimmon-200">Your living map</p>
          <h2 id="journey-title" className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">The road to the Summit Archive</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">Every lesson lights another lantern along your path.</p>
        </header>

        <ol className="grid gap-2 sm:grid-cols-5" aria-label="Learning regions">
          {regions.map((region, index) => {
            const complete = index < activeIndex;
            const active = index === activeIndex;
            const Icon = region.icon;
            return (
              <li key={region.name} className="relative">
                <div className={cn(
                  "min-h-28 rounded-2xl border p-3 backdrop-blur-md transition duration-280",
                  active ? "-translate-y-2 border-persimmon-300 bg-moss-900/85 shadow-float" : "border-white/15 bg-moss-900/60",
                  index > activeIndex && "opacity-65",
                )}>
                  <span className={cn("grid size-9 place-items-center rounded-xl", active ? "bg-persimmon-400 text-moss-900" : "bg-white/10 text-white/80")}> 
                    {complete ? <Check className="size-4" aria-hidden="true" /> : index > activeIndex ? <LockKeyhole className="size-4" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
                  </span>
                  <p className="mt-3 text-sm font-semibold leading-5">{region.name}</p>
                  <p className="mt-1 text-[11px] text-white/55">{active ? "Current region" : complete ? "Trail cleared" : region.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
