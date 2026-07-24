import { UserDetail } from "@/components/admin/users/user-detail";
export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) { const { userId } = await params; return <UserDetail userId={userId} />; }
