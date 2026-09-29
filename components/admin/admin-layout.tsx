"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { authService } from "@/lib/auth/auth-service";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { getBackendMode } from "@/lib/supabase/config";
import { useAdminSessionStore } from "@/store/admin-session-store";

const ADMIN_SESSION_TIMEOUT_MS = 8_000;

export function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authenticated = useAdminSessionStore(
    (state) => state.session.authenticated,
  );
  const establishBackendSession = useAdminSessionStore(
    (state) => state.establishBackendSession,
  );
  const logout = useAdminSessionStore((state) => state.logout);
  const [drawer, setDrawer] = useState(false);
  const [identityChecked, setIdentityChecked] = useState(false);
  const loginRoute = pathname === "/admin/login";
  const backendReady = getBackendMode() === "supabase";

  useEffect(() => {
    if (loginRoute || identityChecked) return;
    if (!backendReady) {
      logout();
      setIdentityChecked(true);
      return;
    }

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
      } else {
        logout();
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
  }, [
    backendReady,
    establishBackendSession,
    identityChecked,
    loginRoute,
    logout,
  ]);

  useEffect(() => {
    if (!identityChecked || authenticated || loginRoute) return;
    const reason = backendReady ? "" : "&error=backend-not-configured";
    router.replace(
      `/admin/login?next=${encodeURIComponent(pathname ?? "/admin")}${reason}`,
    );
  }, [
    authenticated,
    backendReady,
    identityChecked,
    loginRoute,
    pathname,
    router,
  ]);

  if (loginRoute) return <>{children}</>;
  if (!identityChecked) {
    return <AdminLoading message="Verifying admin access…" />;
  }
  if (!authenticated) {
    return <AdminLoading message="Redirecting to admin login…" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <AdminSidebar open={drawer} onClose={() => setDrawer(false)} />
      <div className="lg:pl-72">
        <AdminHeader onMenu={() => setDrawer(true)} />
        <main className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function AdminLoading({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
      <div className="text-center">
        <span className="mx-auto block size-10 animate-spin rounded-full border-4 border-white/20 border-t-teal-400" />
        <p className="mt-4 text-sm text-white/60">{message}</p>
      </div>
    </main>
  );
}
