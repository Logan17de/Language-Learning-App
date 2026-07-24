"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { getBackendMode } from "@/lib/supabase/config";
import { readSyncQueue, syncStatusEvent } from "@/lib/sync/offline-queue";
import { retryPendingSync } from "@/lib/sync/backend-sync";

export function SyncStatus() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (getBackendMode() !== "supabase") return;
    const update = () => {
      setPending(readSyncQueue().length);
      setOnline(navigator.onLine);
    };
    const retry = () => {
      update();
      void retryPendingSync();
    };
    update();
    window.addEventListener("online", retry);
    window.addEventListener("offline", update);
    window.addEventListener(syncStatusEvent, update);
    void retryPendingSync();
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("offline", update);
      window.removeEventListener(syncStatusEvent, update);
    };
  }, []);

  if (getBackendMode() !== "supabase" || (online && pending === 0)) return null;
  return (
    <button type="button" onClick={() => void retryPendingSync()} className="fixed bottom-4 right-4 z-[105] flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-lg">
      {online ? <RefreshCw className="size-4" /> : <CloudOff className="size-4" />}
      {online ? `${pending} change${pending === 1 ? "" : "s"} pending sync` : "Offline — progress queued"}
    </button>
  );
}
