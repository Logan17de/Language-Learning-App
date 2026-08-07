import { AudioLibrary } from "@/components/admin/assets/audio-library";
import { LiveAudioInspector } from "@/components/admin/content/live-content-inspectors";
import { getBackendMode } from "@/lib/supabase/config";

export default function AdminAudioPage() {
  return getBackendMode() === "supabase" ? <LiveAudioInspector /> : <AudioLibrary />;
}
