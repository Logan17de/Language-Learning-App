import type { Metadata } from "next";
import { LessonRouteResolver } from "@/components/lesson/lesson-route-resolver";

export const metadata: Metadata = { title: "Lesson preview" };

export default async function LessonPreviewPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LessonRouteResolver lessonId={lessonId} mode="preview" />;
}
