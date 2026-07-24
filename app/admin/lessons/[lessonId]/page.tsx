import { LessonDetail } from "@/components/admin/lessons/lesson-detail";

export default async function AdminLessonDetailPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <LessonDetail lessonId={lessonId} />;
}
