"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/auth/auth-service";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";

interface PublicAuthState {
  signedIn: boolean;
  isSigningOut: boolean;
  signOut: () => Promise<void>;
}

const PublicAuthContext = createContext<PublicAuthState | null>(null);

export function PublicAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const clearLocalSession = useAppStore((state) => state.signOut);
  const backendMode = getBackendMode();
  const [backendSignedIn, setBackendSignedIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (backendMode !== "supabase") return;

    let active = true;
    void authService.hasSession().then((signedIn) => {
      if (active) setBackendSignedIn(signedIn);
    });

    const unsubscribe = authService.subscribe((signedIn) => {
      if (active) setBackendSignedIn(signedIn);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [backendMode]);

  const signedIn =
    backendMode === "supabase"
      ? backendSignedIn
      : hasHydrated && isAuthenticated;

  const signOut = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    if (backendMode === "supabase") {
      const result = await authService.signOut();
      if (!result.ok) {
        setIsSigningOut(false);
        return;
      }
    }

    clearLocalSession();
    setBackendSignedIn(false);
    setIsSigningOut(false);
    router.refresh();
  }, [backendMode, clearLocalSession, isSigningOut, router]);

  const value = useMemo(
    () => ({ signedIn, isSigningOut, signOut }),
    [isSigningOut, signOut, signedIn],
  );

  return (
    <PublicAuthContext.Provider value={value}>
      {children}
    </PublicAuthContext.Provider>
  );
}

export function usePublicAuthState(): PublicAuthState {
  const value = useContext(PublicAuthContext);
  if (!value) {
    throw new Error("Public auth actions must be rendered inside PublicAuthProvider.");
  }
  return value;
}
