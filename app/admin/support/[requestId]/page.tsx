import { SupportTicketDetail } from "@/components/admin/support/support-ticket-detail";
export default async function AdminSupportDetailPage({ params }: { params: Promise<{ requestId: string }> }) { const { requestId } = await params; return <SupportTicketDetail requestId={requestId} />; }
