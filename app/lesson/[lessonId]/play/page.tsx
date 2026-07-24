import type { Metadata } from "next";
import { LessonRouteResolver } from "@/components/lesson/lesson-route-resolver";
import { getLessonById } from "@/data/mock-lessons";

export const metadata: Metadata = { title: "Lesson player" };

export default async function LessonPlayPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = getLessonById(lessonId);
  return <LessonRouteResolver lessonId={lessonId} staticLesson={lesson} mode="play" />;
}
