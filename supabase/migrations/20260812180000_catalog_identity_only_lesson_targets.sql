-- Custom-topic generation no longer uses kanji_records / grammar_records as a
-- teaching encyclopedia. The JLPT catalogs choose stable target identities;
-- the vocabulary+kanji and grammar activity calls generate lesson-specific
-- teaching content after the original story's JMdict tappability pass.
--
-- Undo the temporary quarantine of incomplete catalog-only kanji. A missing
-- reading/meaning is acceptable for a target identity and must not prevent the
-- worker from resolving the five selected targets.

update public.kanji_records
set quality_status = 'needs_review',
    source_payload = coalesce(source_payload, '{}'::jsonb)
      || jsonb_build_object(
        'catalogOnly', true,
        'lessonTargetIdentityOnly', true,
        'teachingMetadataRequired', false
      ),
    updated_at = now()
where archived_at is null
  and char_length(character) = 1
  and coalesce((source_payload->>'catalogOnly')::boolean, false)
  and (
    cardinality(meanings) = 0
    or cardinality(readings) = 0
  )
  and quality_status = 'rejected'
  and coalesce((source_payload->>'quarantinedIncompleteTeachingMetadata')::boolean, false);

update public.kanji_records
set source_payload = coalesce(source_payload, '{}'::jsonb)
      || jsonb_build_object(
        'lessonTargetIdentityOnly', true,
        'teachingMetadataRequired', false
      ),
    updated_at = now()
where archived_at is null
  and char_length(character) = 1
  and coalesce((source_payload->>'catalogOnly')::boolean, false)
  and (
    cardinality(meanings) = 0
    or cardinality(readings) = 0
  )
  and quality_status <> 'rejected';

update public.grammar_records
set source_payload = coalesce(source_payload, '{}'::jsonb)
      || jsonb_build_object(
        'lessonTargetIdentityOnly', true,
        'teachingMetadataRequired', false
      ),
    updated_at = now()
where archived_at is null
  and coalesce((source_payload->>'catalogOnly')::boolean, false)
  and (
    btrim(meaning) = ''
    or btrim(formation) = ''
    or btrim(usage_notes) = ''
    or cardinality(example_sentences) = 0
  );

comment on column public.kanji_records.quality_status is
  'Content provenance/quality status. Catalog-only rows may remain needs_review with empty teaching metadata because custom lessons use them only as stable target identities.';
