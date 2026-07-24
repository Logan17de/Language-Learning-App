import { GeneratedValidationDetail } from "@/components/admin/generated/validation-detail";

export default async function AdminGeneratedDetailPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <GeneratedValidationDetail lessonId={lessonId} />;
}
