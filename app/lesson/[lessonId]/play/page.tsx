import type { Metadata } from "next";
import { LessonRouteResolver } from "@/components/lesson/lesson-route-resolver";

export const metadata: Metadata = { title: "Lesson player" };

export default async function LessonPlayPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LessonRouteResolver lessonId={lessonId} mode="play" />;
}
