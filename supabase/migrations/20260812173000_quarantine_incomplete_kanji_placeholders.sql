-- Catalog rows are target-selection references, not teaching records.
-- The JLPT reference import deliberately creates placeholder kanji with empty
-- readings/meanings when richer metadata is unavailable. Those placeholders
-- must not leak into resolved lesson libraries merely because a previously
-- exposed/known kanji appears in story text.
--
-- Selected target kanji remain recoverable: the existing
-- enrich_custom_lesson_placeholders_background function can update an
-- incomplete rejected row (it does not require quality_status <> 'rejected')
-- and promotes it to needs_review after validated teaching metadata is stored.

update public.kanji_records
set quality_status = 'rejected',
    source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object(
      'catalogOnly', true,
      'quarantinedIncompleteTeachingMetadata', true,
      'quarantinedAt', now()
    ),
    updated_at = now()
where archived_at is null
  and coalesce((source_payload->>'catalogOnly')::boolean, false)
  and (
    cardinality(meanings) = 0
    or cardinality(readings) = 0
  )
  and quality_status <> 'rejected';

comment on column public.kanji_records.quality_status is
  'Teaching-record quality gate. Catalog-only placeholders with incomplete readings/meanings remain rejected until selected-target enrichment supplies validated teaching metadata.';
