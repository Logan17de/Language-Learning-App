import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  googleSpeechConfig,
  synthesizeGoogleSpeech,
} from "@/lib/audio/google-tts";

const AUDIO_BUCKET = "lesson-audio";
const MAX_TEXT_LENGTH = 1_200;
const PREPARE_CONCURRENCY = 3;

type AdminClient = SupabaseClient;

type AudioAsset = {
  id: string;
  storage_path: string;
  japanese_text: string;
};

export interface EnsuredAudioAsset {
  id: string;
  storagePath: string;
  cached: boolean;
}

export interface PreparedLessonAudio {
  status: "ready";
  generated: number;
  reused: number;
  linked: number;
}

function adminClient(): AdminClient {
  return createAdminClient() as unknown as AdminClient;
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function storagePath(text: string): string {
  const config = googleSpeechConfig();
  const signature = createHash("sha256")
    .update(
      JSON.stringify({
        provider: "google",
        language: config.languageCode,
        voice: config.voiceName,
        speakingRate: config.speakingRate,
        text,
      }),
    )
    .digest("hex");
  return `google/${config.languageCode}/${signature}.mp3`;
}

async function existingByPath(
  admin: AdminClient,
  path: string,
): Promise<AudioAsset | null> {
  const result = await admin
    .from("audio_assets")
    .select("id,storage_path,japanese_text")
    .eq("storage_path", path)
    .is("archived_at", null)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data as AudioAsset | null) ?? null;
}

export async function ensureAudioAsset(
  value: string,
  client?: AdminClient,
): Promise<EnsuredAudioAsset> {
  const text = normalizedText(value);
  if (!text || text.length > MAX_TEXT_LENGTH) {
    throw new Error("Japanese audio text must contain 1-1,200 characters.");
  }
  const admin = client ?? adminClient();
  const path = storagePath(text);
  const existing = await existingByPath(admin, path);
  if (existing) {
    return { id: existing.id, storagePath: existing.storage_path, cached: true };
  }

  const speech = await synthesizeGoogleSpeech(text);
  const uploaded = await admin.storage.from(AUDIO_BUCKET).upload(path, speech.audio, {
    contentType: "audio/mpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) {
    throw new Error(`Lesson audio could not be stored: ${uploaded.error.message}`);
  }

  const durationSeconds = Math.max(0.5, text.length / 5.2 / speech.speakingRate);
  const inserted = await admin
    .from("audio_assets")
    .insert({
      storage_path: path,
      japanese_text: text,
      voice: speech.voiceName,
      speaking_style: "friendly",
      duration_seconds: Number(durationSeconds.toFixed(2)),
      playback_speed: speech.speakingRate,
      status: "active",
    })
    .select("id,storage_path,japanese_text")
    .single();

  if (!inserted.error && inserted.data) {
    const row = inserted.data as AudioAsset;
    return { id: row.id, storagePath: row.storage_path, cached: false };
  }
  if (inserted.error?.code !== "23505") {
    throw new Error(inserted.error?.message ?? "Audio metadata could not be saved.");
  }

  const raced = await existingByPath(admin, path);
  if (!raced) throw new Error("Audio was created but could not be loaded.");
  return { id: raced.id, storagePath: raced.storage_path, cached: true };
}

export async function getSignedAudioUrl(
  storagePathValue: string,
  client?: AdminClient,
): Promise<string> {
  const admin = client ?? adminClient();
  const result = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(storagePathValue, 15 * 60);
  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message ?? "Audio URL could not be created.");
  }
  return result.data.signedUrl;
}

type LinkTarget = {
  table:
    | "lesson_listening_activities"
    | "lesson_speaking_activities";
  id: string;
};

type TextWork = {
  text: string;
  links: LinkTarget[];
};

function addWork(map: Map<string, TextWork>, textValue: unknown, link?: LinkTarget) {
  if (typeof textValue !== "string") return;
  const text = normalizedText(textValue);
  if (!text || text.length > MAX_TEXT_LENGTH) return;
  const item = map.get(text) ?? { text, links: [] };
  if (link) item.links.push(link);
  map.set(text, item);
}

async function inBatches<T>(
  values: T[],
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(PREPARE_CONCURRENCY, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        await worker(values[index]);
      }
    },
  );
  await Promise.all(runners);
}

export async function prepareStoredLessonAudio(
  lessonVersionId: string,
  client?: AdminClient,
): Promise<PreparedLessonAudio> {
  const admin = client ?? adminClient();
  const [listening, speaking] = await Promise.all([
    admin
      .from("lesson_listening_activities")
      .select("id,transcript,audio_asset_id")
      .eq("lesson_version_id", lessonVersionId),
    admin
      .from("lesson_speaking_activities")
      .select("id,model_answer,audio_asset_id")
      .eq("lesson_version_id", lessonVersionId),
  ]);
  const failed = [listening, speaking].find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  const work = new Map<string, TextWork>();
  for (const row of listening.data ?? []) {
    const item = row as Record<string, unknown>;
    if (!item.audio_asset_id) {
      addWork(work, item.transcript, {
        table: "lesson_listening_activities",
        id: String(item.id),
      });
    }
  }
  for (const row of speaking.data ?? []) {
    const item = row as Record<string, unknown>;
    if (!item.audio_asset_id) {
      addWork(work, item.model_answer, {
        table: "lesson_speaking_activities",
        id: String(item.id),
      });
    }
  }

  let generated = 0;
  let reused = 0;
  let linked = 0;
  await inBatches([...work.values()], async (item) => {
    const asset = await ensureAudioAsset(item.text, admin);
    if (asset.cached) reused += 1;
    else generated += 1;
    for (const link of item.links) {
      const updated = await admin
        .from(link.table)
        .update({ audio_asset_id: asset.id })
        .eq("id", link.id);
      if (updated.error) throw new Error(updated.error.message);
      linked += 1;
    }
  });

  return { status: "ready", generated, reused, linked };
}
