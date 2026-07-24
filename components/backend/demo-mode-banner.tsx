import { getBackendMode } from "@/lib/supabase/config";

export function DemoModeBanner() {
  if (process.env.NODE_ENV === "production" || getBackendMode() !== "demo") return null;
  return (
    <div className="relative z-[100] bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-950" role="status">
      AIko is running in local demo mode. Progress is saved only on this device.
    </div>
  );
}
