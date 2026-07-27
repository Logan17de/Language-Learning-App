import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureAudioAsset,
  getSignedAudioUrl,
} from "@/lib/audio/audio-library";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid audio request." }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  const audioAssetId =
    typeof value.audioAssetId === "string" ? value.audioAssetId.trim() : "";
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!audioAssetId && !text) {
    return NextResponse.json(
      { error: "Japanese text or an audio asset is required." },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient() as unknown as SupabaseClient;
    if (audioAssetId) {
      const found = await admin
        .from("audio_assets")
        .select("id,storage_path")
        .eq("id", audioAssetId)
        .eq("status", "active")
        .is("archived_at", null)
        .maybeSingle();
      if (found.error) throw new Error(found.error.message);
      if (found.data) {
        const row = found.data as { id: string; storage_path: string };
        return NextResponse.json({
          audioAssetId: row.id,
          url: await getSignedAudioUrl(row.storage_path, admin),
          cached: true,
        });
      }
    }

    if (!text) {
      return NextResponse.json({ error: "Audio is unavailable." }, { status: 404 });
    }
    const asset = await ensureAudioAsset(text, admin);
    return NextResponse.json({
      audioAssetId: asset.id,
      url: await getSignedAudioUrl(asset.storagePath, admin),
      cached: asset.cached,
    });
  } catch (error) {
    console.error("Lesson TTS request failed.", {
      userId: auth.userId,
      message: error instanceof Error ? error.message : "Unknown audio error",
    });
    return NextResponse.json(
      { error: "Audio could not be prepared. Please try again." },
      { status: 502 },
    );
  }
}
