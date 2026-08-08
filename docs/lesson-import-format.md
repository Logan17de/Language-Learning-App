# AIko complete lesson import format

AIko uses one canonical externally-authored lesson contract for both single and bulk imports. Imported content is normalized into the same `lessons`, `lesson_versions`, story, vocabulary, grammar, reading, listening, speaking, and review tables that the learner application already reads.

The admin importer accepts:

1. one complete JSON object;
2. a JSON array containing 1-100 complete lesson objects; or
3. JSONL with one complete lesson object per non-empty line.

The schema version is currently `1`.

## Required top-level shape

```json
{
  "schemaVersion": 1,
  "id": "lesson_n5_unique_topic",
  "title": "English lesson title",
  "japaneseTitle": "Japanese lesson title",
  "topic": "Topic",
  "level": "N5",
  "durationMinutes": 30,
  "tags": ["topic"],
  "summary": "English summary",
  "storyPreview": "最初の文です。",
  "kanji": [],
  "grammar": [],
  "vocabulary": [],
  "story": [],
  "vocabularyQuestions": [],
  "grammarQuestions": [],
  "speakingExercises": [],
  "readingTitle": "English reading title",
  "readingJapaneseTitle": "Japanese reading title",
  "readingConversation": [],
  "readingQuestions": [],
  "listeningExercises": [],
  "reviewQuestions": []
}
```

Do not use the abbreviated arrays above as an upload. They only show the top-level keys. The exact generation skeleton and examples live in `lib/admin-complete-lesson-prompt.ts`, and the deterministic validator lives in `lib/admin-complete-lesson-import.ts`.

## Fixed content contract

| Region | Required content |
| --- | --- |
| Story | 1-6 blocks, 10-15 Japanese sentences total, with English translation and inspectable story words |
| Kanji | exactly 5 target entries |
| Grammar | exactly 3 target patterns |
| Vocabulary | 8-80 reusable entries |
| Vocabulary / kanji practice | exactly 13 questions: 6 Easy, 4 Medium, 3 Hard |
| Grammar practice | exactly 10 questions: 3 Easy, 4 Medium, 3 Hard |
| Speaking | exactly 5 `read_aloud` items: 2 easy, 2 medium, 1 hard |
| Reading | 1-6 blocks, 10-15 Japanese sentences total, plus exactly 5 questions: 2 easy, 2 medium, 1 hard |
| Listening | exactly 5 questions; every question has a 5-10 line conversation and exactly 4 choices |
| Final review | exactly 5 questions covering kanji, vocabulary, grammar, listening, and speaking once each |

Every choice question needs four unique choices and exactly one choice equal to `correctAnswer`.

Every referenced learning target uses one of these exact forms:

```text
kanji:<character>
vocabulary:<term>
grammar:<pattern>
```

The referenced value must exist in that lesson's top-level `kanji`, `vocabulary`, or `grammar` array.

## Bulk JSON

A 100-lesson upload is simply an array of 100 valid lesson objects:

```json
[
  { "schemaVersion": 1, "id": "lesson_n5_001", "...": "complete lesson 1" },
  { "schemaVersion": 1, "id": "lesson_n5_002", "...": "complete lesson 2" }
]
```

All IDs must be unique. The application validates every lesson before writing anything. The database then imports the entire array transactionally through `import_complete_lessons()`. If one database import fails, the bulk transaction rolls back.

## JSONL

JSONL is useful for large generated files. Each line is one complete lesson object:

```text
{"schemaVersion":1,"id":"lesson_n5_001",...}
{"schemaVersion":1,"id":"lesson_n5_002",...}
```

Do not split one lesson across several JSONL lines.

## Publishing

The admin importer has one `Publish immediately` switch for the whole upload.

- Off: every imported lesson is stored as a draft.
- On: every imported lesson is published and becomes eligible for learner assignment after the transaction succeeds.

## TTS queue

Imported lesson versions automatically enter `lesson_tts_queue`.

AIko generates stored TTS only for the five Listening transcripts. Story has no TTS, Reading remains STT-focused, and Speaking is learner read-aloud/STT.

The existing audio library deduplicates identical Japanese text, voice, speaking rate, and provider configuration, so repeated conversations reuse an existing audio asset instead of synthesizing it again.

### Automatic

When 100 pending imported lesson versions exist, the database atomically creates a threshold `lesson_tts_batches` row containing the oldest 100 lessons. An import request then starts the background TTS worker automatically.

A full 100-lesson batch contains at most 500 Listening clips before deduplication.

### Manual

The admin import screen shows the current pending count and has `Send pending TTS now`. It creates a batch from 1-100 pending lesson versions and starts the same worker immediately.

The internal recovery endpoint is:

```text
GET or POST /api/internal/lesson-tts/process
Authorization: Bearer <CUSTOM_LESSON_WORKER_SECRET or CRON_SECRET>
```

It processes the oldest queued/processing batch, or a supplied `batchId` in a POST body. This can be called by a scheduler if automatic application execution is ever interrupted.

## Audio lifecycle

1. lesson is imported;
2. lesson version enters `lesson_tts_queue`;
3. a manual or 100-lesson threshold batch is created;
4. the worker calls the existing Google TTS adapter for missing Listening audio;
5. MP3 files are stored in the private `lesson-audio` Supabase Storage bucket;
6. `audio_assets` metadata is inserted or reused;
7. every `lesson_listening_activities.audio_asset_id` is linked;
8. the learner player requests a short-lived signed audio URL.

Imported lessons use `stored_or_api` runtime audio mode. Therefore a lesson remains playable before batch completion: if a stored asset is not ready yet, the existing authenticated TTS API can prepare it on demand.

## Deployment order

This feature is stacked on the owner-only admin security branch. Apply migrations in order before deploying the application changes:

```text
20260807090000_owner_only_admin.sql
20260808090000_bulk_lesson_import_tts_queue.sql
20260808090500_imported_lesson_stored_audio_mode.sql
```

Then run:

```bash
npx --yes supabase@latest db push --linked --dry-run
npx --yes supabase@latest db push --linked
npx --yes supabase@latest db lint --linked --level error --fail-on error
```
