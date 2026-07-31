import type { Metadata } from "next";
import { ProgressiveLessonPage } from "@/components/custom-topic/progressive-lesson-page";

export const metadata: Metadata = { title: "Building your lesson" };

export default async function ProgressiveLessonRoute({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return <ProgressiveLessonPage requestId={requestId} />;
}
