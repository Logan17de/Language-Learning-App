import { VocabularyManagement } from "@/components/admin/content/vocabulary-management";
import { LiveVocabularyInspector } from "@/components/admin/content/live-content-inspectors";
import { getBackendMode } from "@/lib/supabase/config";

export default function AdminVocabularyPage() {
  return getBackendMode() === "supabase" ? <LiveVocabularyInspector /> : <VocabularyManagement />;
}
