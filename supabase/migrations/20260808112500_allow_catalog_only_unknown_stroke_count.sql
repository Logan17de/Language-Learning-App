-- The user-supplied JLPT target catalog contains characters and levels only.
-- Preserve the permanent kanji-record invariant for normal/enriched rows while
-- allowing an explicit 0 sentinel only for imported catalog-only placeholders.
-- Those placeholders are marked needs_review and can be enriched later without
-- inventing stroke-count metadata during catalog import.

alter table public.kanji_records
  drop constraint if exists kanji_records_stroke_count_check;

alter table public.kanji_records
  add constraint kanji_records_stroke_count_check
  check (
    stroke_count between 1 and 64
    or (
      stroke_count = 0
      and source_type = 'imported'
      and source_payload @> '{"catalogOnly": true}'::jsonb
    )
  );
