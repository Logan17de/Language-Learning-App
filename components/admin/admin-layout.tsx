"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { authService } from "@/lib/auth/auth-service";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getBackendMode } from "@/lib/supabase/config";
import { useAdminStore } from "@/store/admin-store";

const ADMIN_SESSION_TIMEOUT_MS = 8_000;
const ADMIN_HYDRATION_FALLBACK_MS = 1_500;

export function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useAdminStore((state) => state.hasHydrated);
  const authenticated = useAdminStore((state) => state.session.authenticated);
  const establishBackendSession = useAdminStore(
    (state) => state.establishBackendSession,
  );
  const setHasHydrated = useAdminStore((state) => state.setHasHydrated);
  const [drawer, setDrawer] = useState(false);
  const demoMode = getBackendMode() === "demo";
  const [identityChecked, setIdentityChecked] = useState(demoMode);
  const loginRoute = pathname === "/admin/login";

  useEffect(() => {
    if (hydrated) return;

    const finishHydration = () => setHasHydrated(true);
    const unsubscribe = useAdminStore.persist.onFinishHydration(finishHydration);
    if (useAdminStore.persist.hasHydrated()) finishHydration();
    const fallback = window.setTimeout(
      finishHydration,
      ADMIN_HYDRATION_FALLBACK_MS,
    );

    return () => {
      unsubscribe();
      window.clearTimeout(fallback);
    };
  }, [hydrated, setHasHydrated]);

  useEffect(() => {
    if (!hydrated || loginRoute) return;
    if (authenticated || demoMode) return;

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), ADMIN_SESSION_TIMEOUT_MS);
    });

    async function restoreAdminSession() {
      const identity = await Promise.race([authService.getIdentity(), timedOut]);
      if (!active) return;
      if (identity?.ok && identity.data && canAccessAdmin(identity.data.role)) {
        establishBackendSession(
          identity.data.email,
          identity.data.displayName,
          identity.data.role.replace("_", " "),
        );
      }
      setIdentityChecked(true);
    }

    void restoreAdminSession().finally(() => {
      if (timeout) clearTimeout(timeout);
    });

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [authenticated, demoMode, establishBackendSession, hydrated, loginRoute]);

  useEffect(() => {
    if (hydrated && identityChecked && !authenticated && !loginRoute) {
      router.replace(
        `/admin/login?next=${encodeURIComponent(pathname ?? "/admin")}`,
      );
    }
  }, [authenticated, hydrated, identityChecked, loginRoute, pathname, router]);

  if (loginRoute) return <>{children}</>;
  if (!hydrated || (!authenticated && !identityChecked)) {
    return <AdminLoading message={hydrated ? "Verifying admin access…" : "Loading admin workspace…"} />;
  }
  if (!authenticated) return <AdminLoading message="Redirecting to admin login…" />;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <AdminSidebar open={drawer} onClose={() => setDrawer(false)} />
      <div className="lg:pl-72">
        <AdminHeader onMenu={() => setDrawer(true)} />
        <main className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function AdminLoading({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-moss-900 text-white">
      <div className="text-center">
        <span className="mx-auto grid size-14 animate-pulse place-items-center rounded-2xl border border-persimmon-300/30 bg-white/5 font-serif text-2xl text-persimmon-300">愛</span>
        <p className="mt-4 text-xs font-bold uppercase tracking-[.18em] text-white/60">Opening the guild archive</p>
        <p className="mt-2 text-sm text-white/45">{message}</p>
      </div>
    </main>
  );
}
