import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-moss-100 text-moss-700"><Icon className="size-5" /></span>
        <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{description}</p></div>
      </div>
      <div className="mt-7 space-y-5">{children}</div>
    </Card>
  );
}
