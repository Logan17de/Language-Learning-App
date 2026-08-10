# JLPT offline Batch lesson factory

AIko builds lesson inventory asynchronously for **N5, N4, N3, N2, and N1** through one canonical OpenAI Batch pipeline.

## Curriculum contract

The application, not the model, chooses the curriculum targets:

- owner selects JLPT level: `N5`, `N4`, `N3`, `N2`, or `N1`
- owner selects `1-100` lessons per Batch request
- target kanji: exactly 5 distinct characters from the active `kanji_catalog` entries for that level
- target grammar: exactly 3 distinct patterns from the active `grammar_catalog` entries for that level
- topic: chosen by the model
- output: the canonical complete `schemaVersion: 1` lesson package

The five target kanji are **focus characters, not a whitelist**. The model must use every focus character naturally, including inside natural words/compounds when appropriate, and may use other level-appropriate kanji throughout the lesson. Only the five selected focus characters belong in the top-level `kanji` target array.

## Five-kanji uniqueness

Exact five-kanji uniqueness is a database invariant, not an application-memory convention.

`lesson_generation_kanji_reservations` stores an order-independent signature with a unique constraint on:

```text
(jlpt_level, signature)
```

For each planned lesson AIko:

1. randomly draws five distinct characters from the selected level's active `kanji_catalog` entries;
2. calls `reserve_lesson_generation_kanji_set()`;
3. the database atomically inserts the reservation or returns `false` when that exact set already exists;
4. on conflict AIko draws again.

Order does not matter. `日・月・火・水・木` and `木・火・日・月・水` are the same set.

The reservation migration backfills **all** historical `lesson_generation_requests`, with no status filter. Invalid, API-failed, imported, or otherwise historical target sets therefore stay blocked. Reservations survive batch deletion via `ON DELETE SET NULL`.

Uniqueness is per JLPT level.

## Grammar balancing

Grammar combinations are deliberately reusable; grammar is not the capacity limiter.

For every lesson:

- the three selected patterns are distinct inside that lesson;
- historical usage of each pattern at the selected level is counted from generation requests;
- the picker chooses randomly among the currently least-used patterns;
- current-batch selections immediately increment those usage counts.

This keeps coverage balanced while allowing a grammar pattern to appear again with a different five-kanji lesson.

## Catalog vs enrichment data

Batch target selection reads the finite curriculum catalogs directly:

```text
kanji_catalog
  character, jlpt_level, source_order, active

grammar_catalog
  pattern, jlpt_level, source_order, active
```

`kanji_records` and `grammar_records` remain the enriched dictionary/inspector layer. Missing readings, meanings, stroke counts, formation notes, etc. do not remove a valid catalog target from the Batch scheduler.

## One generation implementation

The Batch system is split by concern:

```text
lesson-generation-contract.ts
  prompt + strict nested Structured Output schema + deterministic validation

lesson-generation-staging.ts
  batch/request inspection + manual repair + canonical import

lesson-batch-generation.ts
  catalog scheduling + reservations + OpenAI Batch submit/sync
```

The historical `n5-batch-generation.ts` and `jlpt-batch-generation.ts` paths are compatibility facades only. They contain no provider or scheduler implementation.

## Structured Output and deterministic validation

Each `/v1/responses` Batch request uses a nested JSON Schema with `strict: true`, required fields, enums, and `additionalProperties: false` on generated objects.

Provider schema adherence is not treated as sufficient. AIko still applies the canonical deterministic validator after retrieval, including exact activity counts, difficulty splits, target references, story/reading constraints, target kanji coverage, target grammar coverage, and the 1,200-character listening TTS limit.

## Storage-first lifecycle

```text
Selected JLPT level + count
  -> active kanji_catalog / grammar_catalog
  -> atomically reserve unique five-kanji set
  -> balanced three-grammar selection
  -> exact prompt + exact Responses request body stored
  -> OpenAI Batch input JSONL
  -> provider output/error JSONL
  -> FULL raw provider line stored first
  -> extract raw model text
  -> parse + deterministic validation
       -> valid
       -> invalid
       -> api_failed
  -> owner review/manual repair
  -> canonical import_complete_lesson()
  -> published lesson
  -> existing Google listening TTS queue
```

`raw_provider_line` and `raw_response` are never changed by manual repair. Owner edits live separately in `edited_lesson`.

Unmatched or unparseable provider JSONL lines are retained in `lesson_generation_batches.unmatched_provider_lines`.

There is intentionally no automatic AI repair loop.

## OpenAI Batch flow

Each staged lesson becomes one JSONL request:

```json
{
  "custom_id": "n3_<batch>_001",
  "method": "POST",
  "url": "/v1/responses",
  "body": {
    "model": "...",
    "input": "...complete AIko lesson prompt...",
    "text": {
      "format": {
        "type": "json_schema",
        "strict": true
      }
    },
    "store": false
  }
}
```

The JSONL file is uploaded with `purpose=batch`. The provider Batch uses endpoint `/v1/responses` and completion window `24h`. `custom_id` is the durable input/output join key; output order is never assumed.

## Admin workflow

Open:

```text
/admin/lessons/batch-generate
```

1. Choose **N5 / N4 / N3 / N2 / N1**.
2. Choose **1-100 lessons**.
3. Submit to the Batch API.
4. AIko reserves five-kanji sets and stores every request before provider submission.
5. Use **Sync OpenAI results** when results are available.
6. Inspect valid, invalid, API-failed, and imported counts separately.
7. Import all valid lessons or inspect one invalid lesson.
8. Edit invalid JSON and choose **Save + validate**.
9. Import the repaired lesson when valid.

## Background sync

```text
GET|POST /api/internal/lesson-generation/sync
Authorization: Bearer <secret>
```

Secret resolution order:

1. `LESSON_GENERATION_WORKER_SECRET`
2. `CUSTOM_LESSON_WORKER_SECRET`
3. `CRON_SECRET`

Background sync downloads/stages/validates provider results only. Canonical import remains owner-authenticated.

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

## Step 2 database migration

Apply before deploying the Step 2 application code:

```text
20260808123000_lesson_generation_target_reservations.sql
```

It creates the permanent kanji reservation table/function and backfills all existing five-kanji generation history.
