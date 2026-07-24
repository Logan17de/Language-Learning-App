import { LessonReportDetail } from "@/components/admin/support/lesson-report-detail";
export default async function AdminReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) { const { reportId } = await params; return <LessonReportDetail reportId={reportId} />; }
