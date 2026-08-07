import { ImageLibrary } from "@/components/admin/assets/image-library";
import { LiveImageInspector } from "@/components/admin/content/live-content-inspectors";
import { getBackendMode } from "@/lib/supabase/config";

export default function AdminImagesPage() {
  return getBackendMode() === "supabase" ? <LiveImageInspector /> : <ImageLibrary />;
}
