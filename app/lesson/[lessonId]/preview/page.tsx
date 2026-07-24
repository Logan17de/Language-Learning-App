import type { Metadata } from "next";
import { LessonRouteResolver } from "@/components/lesson/lesson-route-resolver";
import { getLessonById } from "@/data/mock-lessons";

export const metadata: Metadata = { title: "Lesson preview" };

export default async function LessonPreviewPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = getLessonById(lessonId);
  return <LessonRouteResolver lessonId={lessonId} staticLesson={lesson} mode="preview" />;
}
