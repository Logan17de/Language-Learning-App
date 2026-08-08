# JLPT offline Batch lesson factory

AIko can build curated lesson inventory asynchronously for **N5, N4, N3, N2, and N1** without asking an administrator to author each complete JSON package by hand.

## Curriculum contract

The application, not the model, chooses the curriculum targets:

- JLPT level: owner selects `N5`, `N4`, `N3`, `N2`, or `N1`
- lesson count: owner selects `1-100` per Batch request
- target kanji: exactly 5 randomly selected from the chosen level
- target grammar: exactly 3 randomly selected from the chosen level
- topic: chosen by the model
- output: the existing complete `schemaVersion: 1` lesson package

### Exact-set uniqueness

For the selected JLPT level, AIko loads every previously stored `lesson_generation_requests.target_kanji` and `target_grammar` set from the database.

For each new lesson:

1. Randomly draw 5 distinct kanji from the selected level.
2. Sort/canonicalize the five values and compare them with every stored five-kanji set for that same JLPT level.
3. If the exact set already exists, discard the draw and randomly draw again.
4. Once an unused five-kanji set is found, reserve it immediately for the current Batch plan.
5. Randomly draw 3 distinct grammar patterns.
6. Canonicalize and compare that three-pattern set with every stored grammar target set for that same level.
7. If it exists, redraw until an unused set is found.

Order does not matter for duplicate detection. `日・月・火・水・木` is the same target set as `木・火・日・月・水`.

Kanji-set uniqueness and grammar-set uniqueness are independent. An old five-kanji combination can never be reused for another generated lesson at that level even if paired with different grammar. Likewise, an old three-grammar combination cannot be reused with different kanji.

Every stored generation request counts as history, including invalid and API-failed generations. Once a target set has been assigned and stored, it is considered used. History is isolated by JLPT level: an N5 set does not block an N4/N3/N2/N1 set.

The model must return exactly the selected target sets and selected level. Every target kanji must appear in the main story, and every target grammar pattern must be referenced by at least one grammar practice question.

## Storage-first lifecycle

Generation is deliberately staging-first:

```text
Selected JLPT level
  -> level kanji + grammar catalogs
  -> random unused 5-kanji set
  -> random unused 3-grammar set
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

`raw_provider_line` and `raw_response` are never replaced by manual repair. Once an owner edit is parseable JSON, its working copy is stored separately in `edited_lesson`; the original provider output remains unchanged.

Unmatched or unparseable provider JSONL lines are retained in `lesson_generation_batches.unmatched_provider_lines` instead of being dropped.

## OpenAI Batch flow

Each staged lesson becomes one JSONL request. The custom id includes its selected JLPT level:

```json
{
  "custom_id": "n3_<batch>_001",
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

1. Choose JLPT level: **N5 / N4 / N3 / N2 / N1**.
2. Choose **1-100 lessons**. The default is 100.
3. Select **Submit N LEVEL to Batch API**.
4. AIko randomly finds unused kanji and grammar target sets and stores every plan/request before provider submission.
5. Select the batch and use **Sync OpenAI results** when results are available.
6. Valid, invalid, API-failed, and imported counts are shown separately.
7. Use **Import all valid** to publish valid staged lessons through the existing canonical importer.
8. Open any invalid lesson to see its targets and validation errors.
9. Edit the JSON and choose **Save + validate**.
10. When valid, import that lesson individually or use the batch import button.

There is intentionally no automatic AI repair loop. Failed generation remains evidence and can be corrected manually.

## Background sync

A protected recovery endpoint can sync active provider batches from every JLPT level without keeping the admin page open:

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

## Database

No additional migration is required for the N5-to-N1 expansion. The existing staging tables already store `jlpt_level`, `target_kanji`, and `target_grammar` for every request.

The branch still contains:

```text
20260808090000_bulk_lesson_import_tts_queue.sql
20260808090500_imported_lesson_stored_audio_mode.sql
20260808103000_n5_batch_lesson_generation.sql
```

The `103000` migration filename predates the all-level expansion, but its tables use the shared JLPT enum and support all five levels.
