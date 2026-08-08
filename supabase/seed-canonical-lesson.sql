-- Complete the historical local-development lesson so it exercises the same
-- player contract as production lessons. Keep the original story/library rows,
-- but replace legacy one-item activity regions with complete canonical banks.

-- Vocabulary + grammar practice did not exist in the original seed.
delete from public.lesson_practice_activities
where lesson_version_id = '10000000-0000-4000-8000-000000000101';

insert into public.lesson_practice_activities (
  id, lesson_version_id, position, phase, activity_type, difficulty, mode, skill,
  prompt, cue, choices, correct_answer, accepted_answers, explanation,
  hint_front, hint_back, target_item_ids, inspectable_terms
)
select
  ('31000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000101'::uuid,
  sequence,
  'vocabulary',
  'multiple_choice',
  case when sequence <= 6 then 'Easy'
       when sequence <= 10 then 'Medium'
       else 'Hard' end,
  case when sequence % 2 = 1 then 'kanji-reading' else 'reading-meaning' end,
  'understanding',
  case when sequence % 2 = 1
    then 'What is the correct reading of 駅?'
    else 'What does えき mean?'
  end,
  case when sequence % 2 = 1 then '駅' else 'えき' end,
  case when sequence % 2 = 1
    then array['えき','いき','えぎ','いけ']
    else array['station','company','ticket gate','together']
  end,
  case when sequence % 2 = 1 then 'えき' else 'station' end,
  case when sequence % 2 = 1 then array['えき'] else array['station'] end,
  '駅 is read えき and means station.',
  '',
  '',
  array['12000000-0000-4000-8000-000000000001'::uuid],
  '[]'::jsonb
from generate_series(1, 13) sequence;

insert into public.lesson_practice_activities (
  id, lesson_version_id, position, phase, activity_type, difficulty, mode, skill,
  prompt, cue, choices, correct_answer, accepted_answers, explanation,
  hint_front, hint_back, target_item_ids, inspectable_terms
)
select
  ('32000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000101'::uuid,
  sequence,
  'grammar',
  'multiple_choice',
  case when sequence <= 3 then 'Easy'
       when sequence <= 7 then 'Medium'
       else 'Hard' end,
  'grammar',
  'understanding',
  'What does 〜ながら express?',
  '音楽を聞きながら、駅まで歩きます。',
  array['while doing','because of','even though','after doing'],
  'while doing',
  array['while doing'],
  '〜ながら connects two simultaneous actions by the same person.',
  'Verb stem + ながら',
  'The main action follows ながら.',
  array['11000000-0000-4000-8000-000000000001'::uuid],
  '[]'::jsonb
from generate_series(1, 10) sequence;

-- Five reading-comprehension questions: 2 easy, 2 medium, 1 hard.
delete from public.lesson_reading_questions
where lesson_version_id = '10000000-0000-4000-8000-000000000101';

insert into public.lesson_reading_questions (
  id, lesson_version_id, position, difficulty, question, answer
)
values
  ('33000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 1, 'easy', 'ゆきさんは最近、何ができるようになりましたか。', '早く起きられるようになりました。'),
  ('33000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000101', 2, 'easy', '田中さんはゆきさんに何と言いましたか。', '今日も早いですねと言いました。'),
  ('33000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000101', 3, 'medium', '二人は朝どこで会ったと考えられますか。', '駅の改札で会ったと考えられます。'),
  ('33000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000101', 4, 'medium', 'ゆきさんの朝の習慣はどう変わりましたか。', '以前より早く起きられるようになりました。'),
  ('33000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000101', 5, 'hard', '田中さんが「今日も早いですね」と言ったことから何が分かりますか。', 'ゆきさんが最近よく早い時間に来ていることが分かります。');

-- Listening uses five complete conversations. Stored audio is intentionally
-- absent here; local playback can exercise the normal on-demand audio path.
delete from public.lesson_listening_activities
where lesson_version_id = '10000000-0000-4000-8000-000000000101';

insert into public.lesson_listening_activities (
  id, lesson_version_id, position, difficulty, prompt, transcript,
  conversation_lines, choices, correct_answer, explanation,
  inspectable_terms, target_item_ids
)
select
  ('34000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000101'::uuid,
  sequence,
  case when sequence <= 2 then 'easy'
       when sequence <= 4 then 'medium'
       else 'hard' end,
  'Where do Yuki and Tanaka meet?',
  E'田中：おはようございます。\nゆき：おはようございます。\n田中：改札で会いましたね。\nゆき：はい。\n田中：一緒に行きましょう。',
  array[
    '田中：おはようございます。',
    'ゆき：おはようございます。',
    '田中：改札で会いましたね。',
    'ゆき：はい。',
    '田中：一緒に行きましょう。'
  ],
  array['At the ticket gate','At the café','At the office','On the bus'],
  'At the ticket gate',
  'The speakers say they met at the ticket gate.',
  '[]'::jsonb,
  array['12000000-0000-4000-8000-000000000005'::uuid]
from generate_series(1, 5) sequence;

-- Speaking is read-aloud only: 2 easy, 2 medium, 1 hard.
delete from public.lesson_speaking_activities
where lesson_version_id = '10000000-0000-4000-8000-000000000101';

insert into public.lesson_speaking_activities (
  id, lesson_version_id, position, mode, question_type, prompt,
  easy_prompt, medium_prompt, hard_prompt, expected_answer, model_answer,
  expected_concepts, semantic_criteria, inspectable_terms, target_item_ids
)
values
  ('35000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 1, 'easy', 'read_aloud', 'ゆきさんは駅まで歩きます。', 'ゆきさんは駅まで歩きます。', null, null, 'ゆきさんは駅まで歩きます。', 'ゆきさんは駅まで歩きます。', '{}', '{}', '[]'::jsonb, array['12000000-0000-4000-8000-000000000001'::uuid]),
  ('35000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000101', 2, 'easy', 'read_aloud', 'ゆきさんは会社へ行きます。', 'ゆきさんは会社へ行きます。', null, null, 'ゆきさんは会社へ行きます。', 'ゆきさんは会社へ行きます。', '{}', '{}', '[]'::jsonb, array['12000000-0000-4000-8000-000000000003'::uuid]),
  ('35000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000101', 3, 'medium', 'read_aloud', '音楽を聞きながら、駅まで歩きます。', null, '音楽を聞きながら、駅まで歩きます。', null, '音楽を聞きながら、駅まで歩きます。', '音楽を聞きながら、駅まで歩きます。', '{}', '{}', '[]'::jsonb, array['11000000-0000-4000-8000-000000000001'::uuid]),
  ('35000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000101', 4, 'medium', 'read_aloud', '改札で田中さんに会って、一緒に電車に乗ります。', null, '改札で田中さんに会って、一緒に電車に乗ります。', null, '改札で田中さんに会って、一緒に電車に乗ります。', '改札で田中さんに会って、一緒に電車に乗ります。', '{}', '{}', '[]'::jsonb, array['12000000-0000-4000-8000-000000000005'::uuid]),
  ('35000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000101', 5, 'hard', 'read_aloud', '最近、ゆきさんは早く起きられるようになり、朝の時間を上手に使っています。', null, null, '最近、ゆきさんは早く起きられるようになり、朝の時間を上手に使っています。', '最近、ゆきさんは早く起きられるようになり、朝の時間を上手に使っています。', '最近、ゆきさんは早く起きられるようになり、朝の時間を上手に使っています。', '{}', '{}', '[]'::jsonb, array['11000000-0000-4000-8000-000000000002'::uuid]);

-- Final review contains each canonical category exactly once.
delete from public.lesson_review_activities
where lesson_version_id = '10000000-0000-4000-8000-000000000101';

insert into public.lesson_review_activities (
  id, lesson_version_id, position, prompt, choices, correct_answer,
  explanation, question_type, category, target_item_ids
)
values
  ('36000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 1, 'What is the reading of 駅?', array['えき','いき','えぎ','いけ'], 'えき', '駅 is read えき.', 'multiple-choice', 'kanji', array['13000000-0000-4000-8000-000000000003'::uuid]),
  ('36000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000101', 2, 'What does 改札 mean?', array['ticket gate','station','company','train'], 'ticket gate', '改札 means ticket gate.', 'multiple-choice', 'vocabulary', array['12000000-0000-4000-8000-000000000005'::uuid]),
  ('36000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000101', 3, 'What does 〜ながら express?', array['while doing','because','before','if'], 'while doing', '〜ながら expresses simultaneous actions.', 'multiple-choice', 'grammar', array['11000000-0000-4000-8000-000000000001'::uuid]),
  ('36000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000101', 4, 'Where did the speakers meet?', array['At the ticket gate','At the café','At the office','On the bus'], 'At the ticket gate', 'They met at the ticket gate.', 'multiple-choice', 'listening', array['12000000-0000-4000-8000-000000000005'::uuid]),
  ('36000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000101', 5, 'Which sentence matches the speaking practice?', array['音楽を聞きながら、駅まで歩きます。','駅へ行きません。','会社で寝ます。','バスで帰ります。'], '音楽を聞きながら、駅まで歩きます。', 'This sentence is used in the speaking practice.', 'multiple-choice', 'speaking', array['11000000-0000-4000-8000-000000000001'::uuid]);
