import { GrammarManagement } from "@/components/admin/content/grammar-management";
import { LiveGrammarInspector } from "@/components/admin/content/live-content-inspectors";
import { getBackendMode } from "@/lib/supabase/config";

export default function AdminGrammarPage() {
  return getBackendMode() === "supabase" ? <LiveGrammarInspector /> : <GrammarManagement />;
}
