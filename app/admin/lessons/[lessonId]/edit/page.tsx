import { LessonEditor } from "@/components/admin/lessons/lesson-editor";

export default async function AdminLessonEditorPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <LessonEditor lessonId={lessonId} />;
}
