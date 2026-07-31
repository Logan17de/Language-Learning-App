import type { Metadata } from "next";
import { ProgressiveStoryPage } from "@/components/lesson/progressive-story-page";

export const metadata: Metadata = { title: "Your story" };

export default async function BuildingLessonPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return <ProgressiveStoryPage requestId={requestId} />;
}
