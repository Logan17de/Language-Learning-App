-- Reset AIko's reusable vocabulary cache now that local JMdict is the
-- authoritative source for custom-lesson vocabulary enrichment.
--
-- This intentionally removes all vocabulary_records created before/during the
-- older enrichment implementations. The local JMdict dictionary itself lives
-- in public.jmdict_entries and is NOT modified by this migration.
--
-- Existing lesson_vocabulary rows keep their denormalized Japanese/reading/
-- meaning content; their vocabulary_id foreign key is ON DELETE SET NULL.
-- Existing story-word vocabulary UUIDs are cleared explicitly because
-- lesson_story_words.library_id is not a foreign key.

-- story_vocabulary_enrichments uses ON DELETE RESTRICT for vocabulary_id, so
-- remove these request-local cache links before clearing the reusable library.
delete from public.story_vocabulary_enrichments;

-- Old generated story words may contain UUIDs pointing at the vocabulary
-- library. They remain useful as denormalized story text, but must not retain
-- stale pre-JMdict library identities.
update public.lesson_story_words
set library_id = null,
    library_type = null,
    updated_at = now()
where library_type = 'vocabulary';

-- Vocabulary mastery/review keys are vocabulary_record UUID strings. Once the
-- old library is removed those keys are invalid, so reset only vocabulary
-- learner state. Kanji/grammar/listening/speaking progress is untouched.
delete from public.learner_mastery_events
where item_type = 'vocabulary';

delete from public.review_queue
where item_type = 'vocabulary';

delete from public.learner_mastery
where item_type = 'vocabulary';

-- Clean slate. Future custom-lesson vocabulary rows are recreated from the
-- already-loaded local JMdict lookup path.
delete from public.vocabulary_records;

comment on table public.vocabulary_records is
  'Reusable canonical vocabulary cache. After the local-JMdict reset, custom-lesson vocabulary is repopulated from public.jmdict_entries; exact lesson surfaces remain in lesson/story tables.';
