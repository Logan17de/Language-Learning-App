# N5 offline Batch lesson factory

AIko can build curated N5 lesson inventory asynchronously without asking an administrator to author each complete JSON package by hand.

## Curriculum contract

The application, not the model, chooses the curriculum targets:

- JLPT level: `N5`
- target kanji: exactly 5
- target grammar: exactly 3
- topic: chosen by the model
- output: the existing complete `schemaVersion: 1` lesson package

The scheduler reads active N5 `kanji_records` and `grammar_records`. It favors lower-use targets and adds a penalty when the same targets have repeatedly appeared together. Existing in-flight/valid/imported staged requests count toward coverage; invalid and API-failed requests do not permanently consume coverage.

The model must return exactly the selected target sets. Every target kanji must appear in the main story, and every target grammar pattern must be referenced by at least one grammar practice question.

## Storage-first lifecycle

Generation is deliberately staging-first:

```text
N5 catalogs
  -> balanced target plan
  -> lesson_generation_batches / lesson_generation_requests
  -> exact prompt + exact Responses request body stored
  -> OpenAI Batch input file
  -> provider output/error JSONL
  -> full provider line stored
  -> raw model text stored
  -> parse + deterministic validation
       -> valid
       -> invalid
       -> api_failed
  -> owner review/repair
  -> canonical import_complete_lesson()
  -> published lesson
  -> existing listening TTS queue
```

`raw_provider_line` and `raw_response` are never replaced by manual repair. `edited_lesson` is a separate JSON copy. `edited_raw_response` preserves an in-progress manual draft even when it is temporarily malformed JSON.

Unmatched or unparseable provider JSONL lines are retained in `lesson_generation_batches.unmatched_provider_lines` instead of being dropped.

## OpenAI Batch flow

Each staged lesson becomes one JSONL request:

```json
{
  "custom_id": "n5_<batch>_001",
  "method": "POST",
  "url": "/v1/responses",
  "body": {
    "model": "...",
    "input": "...complete AIko lesson prompt...",
    "reasoning": { "effort": "low" },
    "text": { "format": { "type": "json_schema" } },
    "store": false
  }
}
```

AIko uploads the JSONL file with `purpose=batch` and creates a provider batch with endpoint `/v1/responses` and completion window `24h`.

The `custom_id` is the durable join key. Provider output order is never assumed to match input order.

## Admin workflow

Open:

```text
/admin/lessons/batch-generate
```

1. Choose 1-100 lessons. The default is 100.
2. Select **Submit N to Batch API**.
3. AIko stores the target combinations and exact requests before provider submission.
4. Select the batch and use **Sync OpenAI results** when results are available.
5. Valid, invalid, API-failed, and imported counts are shown separately.
6. Use **Import all valid** to publish valid staged lessons through the existing canonical importer.
7. Open any invalid lesson to see its targets and validation errors.
8. Edit the JSON and choose **Save + validate**.
9. When valid, import that lesson individually or use the batch import button.

There is intentionally no automatic AI repair loop in this workflow. Failed generation remains evidence and can be corrected manually.

## Background sync

A protected recovery endpoint can sync active provider batches without keeping the admin page open:

```text
GET|POST /api/internal/lesson-generation/sync
Authorization: Bearer <secret>
```

Secret resolution order:

1. `LESSON_GENERATION_WORKER_SECRET`
2. `CUSTOM_LESSON_WORKER_SECRET`
3. `CRON_SECRET`

The endpoint only downloads/stages/validates Batch results. Canonical import remains an owner-authenticated action.

## Required environment

```text
OPENAI_API_KEY=...
OPENAI_LESSON_MODEL=gpt-5.6-luna
OPENAI_STORY_REASONING_EFFORT=low
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```text
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_REQUEST_TIMEOUT_MS=120000
LESSON_GENERATION_WORKER_SECRET=...
```

## Database migrations

The branch contains the previously missing PR #40 migrations plus the new staging migrations:

```text
20260808090000_bulk_lesson_import_tts_queue.sql
20260808090500_imported_lesson_stored_audio_mode.sql
20260808103000_n5_batch_lesson_generation.sql
20260808103500_preserve_manual_lesson_repair_text.sql
```

If the first two were already applied from the old stacked PR branch, Supabase migration history should recognize them by version and only apply the new `103000` and `103500` migrations.

Always inspect first:

```bash
npx --yes supabase@latest db push --linked --dry-run
```

Then apply and lint:

```bash
npx --yes supabase@latest db push --linked
npx --yes supabase@latest db lint --linked --level error --fail-on error
```
