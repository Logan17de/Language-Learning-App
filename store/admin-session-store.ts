"use client";

import { create } from "zustand";
import type { AdminSession } from "@/types/admin";

const signedOutSession: AdminSession = {
  authenticated: false,
  email: "",
  displayName: "AIko Admin",
  role: "Administrator",
};

interface AdminSessionState {
  session: AdminSession;
  establishBackendSession: (
    email: string,
    displayName: string,
    role: string,
  ) => void;
  logout: () => void;
}

export const useAdminSessionStore = create<AdminSessionState>((set) => ({
  session: signedOutSession,
  establishBackendSession: (email, displayName, role) =>
    set({
      session: {
        authenticated: true,
        email,
        displayName,
        role,
        signedInAt: new Date().toISOString(),
      },
    }),
  logout: () => set({ session: signedOutSession }),
}));
