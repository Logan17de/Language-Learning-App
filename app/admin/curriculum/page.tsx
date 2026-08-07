import { CurriculumDashboard } from "@/components/admin/curriculum/curriculum-dashboard";
import { LiveCurriculumInspector } from "@/components/admin/content/live-content-inspectors";
import { getBackendMode } from "@/lib/supabase/config";

export default function AdminCurriculumPage() {
  return getBackendMode() === "supabase" ? <LiveCurriculumInspector /> : <CurriculumDashboard />;
}
