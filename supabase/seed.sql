-- Deterministic local development seed for AIko.
-- Auth users are intentionally not inserted here; create them through Supabase Auth.

insert into public.curriculum_levels (id, jlpt_level, title, description, sequence_order)
values
  ('00000000-0000-4000-8000-000000000005', 'N5', 'JLPT N5', 'Foundational Japanese', 1),
  ('00000000-0000-4000-8000-000000000004', 'N4', 'JLPT N4', 'Elementary Japanese', 2),
  ('00000000-0000-4000-8000-000000000003', 'N3', 'JLPT N3', 'Intermediate Japanese', 3),
  ('00000000-0000-4000-8000-000000000002', 'N2', 'JLPT N2', 'Upper-intermediate Japanese', 4),
  ('00000000-0000-4000-8000-000000000001', 'N1', 'JLPT N1', 'Advanced Japanese', 5)
on conflict (id) do update set title = excluded.title, description = excluded.description;

insert into public.grammar_records
  (id, legacy_id, pattern, meaning, formation, usage_notes, example_sentences, common_mistakes, jlpt_level)
values
  ('11000000-0000-4000-8000-000000000001', 'grammar_nagara', '〜ながら', 'while doing',
   'Verb stem + ながら', 'Connects two simultaneous actions by the same person.',
   array['音楽を聞きながら、駅まで歩きます。 — I walk to the station while listening to music.'],
   array['The main action comes after ながら.'], 'N4'),
  ('11000000-0000-4000-8000-000000000002', 'grammar_youninaru', '〜ようになる', 'to come to / become able to',
   'Dictionary verb + ようになる', 'Describes a gradual change in habit or ability.',
   array['早く起きられるようになりました。 — I have become able to wake up early.'],
   array['Use it for a change over time, not a one-time decision.'], 'N4')
on conflict (id) do update set pattern = excluded.pattern, meaning = excluded.meaning, updated_at = now();

insert into public.vocabulary_records
  (id, legacy_id, written_form, reading, meaning, part_of_speech, jlpt_level, example_sentence)
values
  ('12000000-0000-4000-8000-000000000001', 'vocab_station', '駅', 'えき', 'station', 'noun', 'N5', '駅まで歩きます。'),
  ('12000000-0000-4000-8000-000000000002', 'vocab_work', '働く', 'はたらく', 'to work', 'verb', 'N4', '会社で働いています。'),
  ('12000000-0000-4000-8000-000000000003', 'vocab_company', '会社', 'かいしゃ', 'company', 'noun', 'N5', '会社は駅から十分です。'),
  ('12000000-0000-4000-8000-000000000004', 'vocab_together', '一緒に', 'いっしょに', 'together', 'adverb', 'N5', '一緒に電車に乗ります。'),
  ('12000000-0000-4000-8000-000000000005', 'vocab_gate', '改札', 'かいさつ', 'ticket gate', 'noun', 'N4', '改札で会います。')
on conflict (id) do update set written_form = excluded.written_form, meaning = excluded.meaning, updated_at = now();

insert into public.kanji_records
  (id, character, readings, meanings, jlpt_level, stroke_count)
values
  ('13000000-0000-4000-8000-000000000001', '働', array['はたら'], array['work'], 'N4', 13),
  ('13000000-0000-4000-8000-000000000002', '場', array['ば'], array['place'], 'N4', 12),
  ('13000000-0000-4000-8000-000000000003', '駅', array['えき'], array['station'], 'N5', 14),
  ('13000000-0000-4000-8000-000000000004', '改札', array['かいさつ'], array['ticket gate'], 'N4', 23)
on conflict (id) do update set readings = excluded.readings, meanings = excluded.meanings, updated_at = now();

insert into public.image_assets
  (id, legacy_id, storage_path, description, topic_tags, jlpt_level, quality_score, creation_source, status)
values
  ('14000000-0000-4000-8000-000000000001', 'img_commute_station', 'seed/commute-station.webp',
   'A calm morning walk to the station', array['commute','station'], 'N4', 80, 'placeholder', 'active'),
  ('14000000-0000-4000-8000-000000000002', 'img_commute_train', 'seed/commute-train.webp',
   'Colleagues riding the train together', array['commute','train'], 'N4', 80, 'placeholder', 'active')
on conflict (id) do update set description = excluded.description, updated_at = now();

insert into public.audio_assets
  (id, legacy_id, storage_path, japanese_text, voice, speaking_style, duration_seconds, playback_speed, status)
values
  ('15000000-0000-4000-8000-000000000001', 'audio_commute_story', 'seed/commute-story.mp3',
   '音楽を聞きながら、駅まで歩きます。', 'placeholder', 'neutral', 8, 1, 'active')
on conflict (id) do update set japanese_text = excluded.japanese_text, updated_at = now();

insert into public.lessons
  (id, legacy_id, slug, title, japanese_title, summary, topic, jlpt_level, duration_minutes,
   status, source, tags, published_at)
values
  ('10000000-0000-4000-8000-000000000001', 'lesson_n4_commute_001', 'going-to-work',
   'Going to Work', '会社へ行く朝',
   'Follow Yuki''s morning commute and learn to describe two actions happening at once.',
   'Daily life', 'N4', 30, 'published', 'curated_seed',
   array['commute','work','station','daily life','conversation'], '2026-07-24T00:00:00Z')
on conflict (id) do update set
  title = excluded.title, summary = excluded.summary, status = excluded.status,
  published_at = excluded.published_at, updated_at = now();

insert into public.lesson_versions
  (id, lesson_id, version_number, status, change_summary, schema_version, answer_keys, review_items, phases, published_at)
values
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001', 1,
   'published', 'Initial curated version', 1,
   array['えき','At the ticket gate','音楽を聞きながら、会社へ行きます。'],
   array['駅','〜ので'],
   '[{"id":"story","label":"Story","description":"Meet today''s language in context"},{"id":"vocabulary","label":"Words & kanji","description":"Build fast recognition"},{"id":"grammar","label":"Grammar","description":"Understand two useful patterns"},{"id":"reading","label":"Read aloud","description":"Practice rhythm and recognition"},{"id":"listening","label":"Listening","description":"Listen for meaning"},{"id":"speaking","label":"Speaking","description":"Produce natural Japanese"},{"id":"review","label":"Final review","description":"Retrieve without hints"}]'::jsonb,
   '2026-07-24T00:00:00Z')
on conflict (id) do update set change_summary = excluded.change_summary, updated_at = now();

update public.lessons
set current_version_id = '10000000-0000-4000-8000-000000000101'
where id = '10000000-0000-4000-8000-000000000001';

insert into public.lesson_story_lines
  (id, lesson_version_id, position, japanese_text, translation, tappable_terms, image_asset_id, audio_asset_id)
values
  ('16000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 1,
   '朝、ゆきさんは六時半に起きます。', 'Yuki wakes up at 6:30 in the morning.', array['朝'], '14000000-0000-4000-8000-000000000001', null),
  ('16000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000101', 2,
   'コーヒーを飲みながら、ニュースを読みます。', 'She reads the news while drinking coffee.', array['飲み','読み'], null, null),
  ('16000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000101', 3,
   '音楽を聞きながら、駅まで歩きます。', 'She walks to the station while listening to music.', array['聞き','駅','歩き'], null, '15000000-0000-4000-8000-000000000001'),
  ('16000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000101', 4,
   '改札で同僚の田中さんに会います。', 'She meets her colleague Tanaka at the ticket gate.', array['改札','同僚','会い'], '14000000-0000-4000-8000-000000000002', null)
on conflict (id) do update set japanese_text = excluded.japanese_text, translation = excluded.translation, updated_at = now();

insert into public.lesson_vocabulary
  (id, lesson_version_id, vocabulary_id, position, written_form, reading, meaning, part_of_speech)
values
  ('17000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', '12000000-0000-4000-8000-000000000001', 1, '駅', 'えき', 'station', 'noun'),
  ('17000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000101', '12000000-0000-4000-8000-000000000002', 2, '働く', 'はたらく', 'to work', 'verb'),
  ('17000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000101', '12000000-0000-4000-8000-000000000003', 3, '会社', 'かいしゃ', 'company', 'noun'),
  ('17000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000101', '12000000-0000-4000-8000-000000000004', 4, '一緒に', 'いっしょに', 'together', 'adverb'),
  ('17000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000101', '12000000-0000-4000-8000-000000000005', 5, '改札', 'かいさつ', 'ticket gate', 'noun')
on conflict (id) do update set position = excluded.position, updated_at = now();

insert into public.lesson_grammar
  (id, lesson_version_id, grammar_id, position, pattern, meaning, structure, usage_notes, example, translation, common_mistake)
values
  ('18000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', '11000000-0000-4000-8000-000000000001', 1, '〜ながら', 'while doing', 'Verb stem + ながら', 'Same subject performs both actions.', '音楽を聞きながら、駅まで歩きます。', 'I walk to the station while listening to music.', 'The main action comes after ながら.'),
  ('18000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000101', '11000000-0000-4000-8000-000000000002', 2, '〜ようになる', 'to come to / become able to', 'Dictionary verb + ようになる', 'Describes gradual change.', '早く起きられるようになりました。', 'I have become able to wake up early.', 'Use it for a change over time.')
on conflict (id) do update set position = excluded.position, updated_at = now();

insert into public.lesson_reading_sections
  (id, lesson_version_id, position, speaker, japanese_text, translation)
values
  ('19000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 1, '田中',
   'おはようございます。今日も早いですね。', 'Good morning. You are early again today.'),
  ('19000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000101', 2, 'ゆき',
   '最近、早く起きられるようになったんです。', 'Recently, I have become able to wake up early.')
on conflict (id) do update set japanese_text = excluded.japanese_text, translation = excluded.translation, updated_at = now();

insert into public.lesson_listening_activities
  (id, lesson_version_id, position, prompt, choices, correct_answer, explanation, transcript, audio_asset_id)
values
  ('1a000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 1,
   'Where does Yuki meet Tanaka?', array['At the café','At the ticket gate','At the office','On the bus'],
   'At the ticket gate', 'The speaker says 改札で田中さんに会います.', '改札で田中さんに会います。',
   '15000000-0000-4000-8000-000000000001')
on conflict (id) do update set prompt = excluded.prompt, updated_at = now();

insert into public.lesson_speaking_activities
  (id, lesson_version_id, position, prompt, model_answer, mode, expected_answer)
values
  ('1b000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 1,
   'Say what you do while commuting.', '音楽を聞きながら、会社へ行きます。', 'medium',
   '音楽を聞きながら、会社へ行きます。')
on conflict (id) do update set prompt = excluded.prompt, updated_at = now();

insert into public.lesson_review_activities
  (id, lesson_version_id, position, prompt, choices, correct_answer, explanation, question_type, category)
values
  ('1c000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 1,
   'What is the reading of 駅?', array['えき','いき','えぎ','いけ'], 'えき',
   '駅 is read えき and means station.', 'multiple-choice', 'vocabulary')
on conflict (id) do update set prompt = excluded.prompt, updated_at = now();

insert into public.lesson_assets
  (id, lesson_version_id, asset_type, image_asset_id, audio_asset_id, position)
values
  ('1d000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 'image',
   '14000000-0000-4000-8000-000000000001', null, 1),
  ('1d000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000101', 'audio',
   null, '15000000-0000-4000-8000-000000000001', 2)
on conflict (id) do update set position = excluded.position, updated_at = now();

insert into public.achievements (id, key, title, description, target, active)
values
  ('20000000-0000-4000-8000-000000000001', 'first_lesson', 'First Step', 'Complete your first lesson.', 1, true),
  ('20000000-0000-4000-8000-000000000002', 'week_streak', 'Seven-day Rhythm', 'Study for seven consecutive days.', 7, true)
on conflict (id) do update set title = excluded.title, description = excluded.description, updated_at = now();

insert into public.feature_flags (id, key, description, enabled, public)
values
  ('21000000-0000-4000-8000-000000000001', 'custom_lessons', 'Show deterministic custom-topic requests.', true, true),
  ('21000000-0000-4000-8000-000000000002', 'backend_progress_sync', 'Persist learner progress to Supabase.', true, false)
on conflict (key) do update set enabled = excluded.enabled, description = excluded.description, updated_at = now();

insert into public.service_status (id, service_name, status, detail)
values
  ('22000000-0000-4000-8000-000000000001', 'database', 'operational', 'Supabase PostgreSQL is available.'),
  ('22000000-0000-4000-8000-000000000002', 'lesson_generation', 'degraded', 'Deterministic matching only in Phase 5.')
on conflict (service_name) do update set status = excluded.status, detail = excluded.detail, updated_at = now();

insert into public.cost_records (id, category, record_date, amount, unit, units, metadata)
values
  ('23000000-0000-4000-8000-000000000001', 'database', '2026-07-01', 25, 'USD', 1, '{"provider":"Supabase","seeded":true}')
on conflict (id) do update set amount = excluded.amount, updated_at = now();
