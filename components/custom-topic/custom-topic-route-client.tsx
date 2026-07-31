"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CustomTopicPage } from "@/components/custom-topic/custom-topic-page";

export function CustomTopicRouteClient() {
  const router = useRouter();

  useEffect(() => {
    let lastRequestId = "";
    const moveToStory = () => {
      const requestId = new URL(window.location.href).searchParams.get("requestId")?.trim() ?? "";
      if (!requestId || requestId === lastRequestId) return;
      lastRequestId = requestId;
      router.replace(`/lesson/building/${encodeURIComponent(requestId)}`);
    };
    moveToStory();
    const timer = window.setInterval(moveToStory, 150);
    return () => window.clearInterval(timer);
  }, [router]);

  return <CustomTopicPage />;
}
