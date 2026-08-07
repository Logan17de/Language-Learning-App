import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseCompleteLessonBatch,
  validateCompleteLessonBatch,
} from "@/lib/admin-complete-lesson-bulk-import";

const queueMigration = readFileSync(
  "supabase/migrations/20260808090000_bulk_lesson_import_tts_queue.sql",
  "utf8",
);
const audioModeMigration = readFileSync(
  "supabase/migrations/20260808090500_imported_lesson_stored_audio_mode.sql",
  "utf8",
);
const importRoute = readFileSync("app/api/admin/lessons/import/route.ts", "utf8");
const batchRoute = readFileSync("app/api/admin/audio/batches/route.ts", "utf8");
const worker = readFileSync("lib/audio/lesson-tts-batches.ts", "utf8");
const audioLibrary = readFileSync("lib/audio/audio-library.ts", "utf8");
const importPage = readFileSync("app/admin/lessons/import/page.tsx", "utf8");

function smallRecord(id: string) {
  return { schemaVersion: 1, id };
}

describe("bulk complete lesson ingestion", () => {
  it("keeps JSONL lessons as separate records instead of merging them", () => {
    const source = [
      JSON.stringify(smallRecord("lesson_n5_001")),
      JSON.stringify(smallRecord("lesson_n5_002")),
    ].join("\n");
    const parsed = parseCompleteLessonBatch(source) as Array<{ id: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed.map((item) => item.id)).toEqual([
      "lesson_n5_001",
      "lesson_n5_002",
    ]);
  });

  it("accepts a JSON array boundary of 100 and rejects 101", () => {
    const hundred = Array.from({ length: 100 }, (_, index) =>
      smallRecord(`lesson_n5_${String(index).padStart(3, "0")}`),
    );
    expect(parseCompleteLessonBatch(JSON.stringify(hundred))).toHaveLength(100);

    const result = validateCompleteLessonBatch([
      ...hundred,
      smallRecord("lesson_n5_101"),
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.errors).toContain(
      "One bulk upload accepts at most 100 lessons.",
    );
  });

  it("rejects duplicate lesson IDs before database import", () => {
    const values = [smallRecord("lesson_n5_same"), smallRecord("lesson_n5_same")];
    const result = validateCompleteLessonBatch(values);
    expect(result.valid).toBe(false);
    expect(
      result.issues.some((issue) =>
        issue.errors.some((error) => error.includes("duplicates upload item")),
      ),
    ).toBe(true);
  });

  it("uses the canonical transaction and starts TTS only after DB queuing", () => {
    expect(importRoute).toContain('authorize("manage_content")');
    expect(importRoute).toContain('rpc("import_complete_lessons"');
    expect(importRoute).toContain("processLessonTtsBatches");
    expect(importRoute).not.toContain("generateStructured");
    expect(importRoute).not.toContain("OPENAI_");
    expect(queueMigration).toContain(
      "create or replace function public.import_complete_lessons",
    );
    expect(queueMigration).toContain(
      "v_result := public.import_complete_lesson(v_item, p_publish)",
    );
  });
});

describe("imported lesson TTS batching", () => {
  it("creates a durable automatic batch at exactly 100 pending lessons", () => {
    expect(queueMigration).toContain("create table if not exists public.lesson_tts_queue");
    expect(queueMigration).toContain("create table if not exists public.lesson_tts_batches");
    expect(queueMigration).toContain("public.create_lesson_tts_batch(100, 'threshold')");
    expect(queueMigration).toContain("p_trigger_source = 'threshold' and v_count < 100");
    expect(queueMigration).toContain("limit v_limit");
  });

  it("keeps browser access away from TTS queue mutations", () => {
    expect(queueMigration).toContain(
      "revoke all on table public.lesson_tts_batches from public, anon, authenticated",
    );
    expect(queueMigration).toContain(
      "revoke all on table public.lesson_tts_queue from public, anon, authenticated",
    );
    expect(batchRoute).toContain('authorize("manage_content")');
  });

  it("uses the existing reusable Google audio library for listening only", () => {
    expect(worker).toContain("prepareStoredLessonAudio");
    expect(worker).toContain("LESSON_CONCURRENCY = 4");
    expect(audioLibrary).toContain('from("lesson_listening_activities")');
    expect(audioLibrary).not.toContain('from("lesson_speaking_activities")');
    expect(audioModeMigration).toContain("'{runtimeAudio}'");
    expect(audioModeMigration).toContain('"stored_or_api"');
  });

  it("exposes manual TTS sending from the bulk lesson admin page", () => {
    expect(importPage).toContain("BulkCompleteLessonImporter");
    expect(batchRoute).toContain('p_trigger_source: "manual"');
    expect(batchRoute).toContain("Math.min(requestedLimit, 100)");
  });
});
