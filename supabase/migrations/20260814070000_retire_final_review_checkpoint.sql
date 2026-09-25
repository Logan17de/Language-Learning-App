-- The learner lesson contract now has six phases and only three durable activity
-- groups. Keep the historical review_group column for migration compatibility,
-- but make it a neutral empty object so older application code cannot send a
-- valid three-group lesson back to activity generation solely because this
-- retired checkpoint is NULL.

alter table public.progressive_lesson_drafts
  alter column review_group
  set default '{"reviewQuestions":[]}'::jsonb;

update public.progressive_lesson_drafts
set review_group = '{"reviewQuestions":[]}'::jsonb,
    completed_groups = array_remove(completed_groups, 'final_review'),
    failed_groups = array_remove(failed_groups, 'final_review'),
    updated_at = now()
where review_group is null
   or 'final_review' = any(completed_groups)
   or 'final_review' = any(failed_groups);

-- New jobs created through begin_custom_lesson_generation_v4 omit review_group,
-- so the column default above supplies the compatibility object automatically.
-- No new final-review generation work is scheduled by the current checkpoint
-- validator; the three active groups remain vocabulary_and_kanji,
-- grammar_and_reading, and listening_and_speaking.
