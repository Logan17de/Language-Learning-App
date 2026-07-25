create table if not exists public.lesson_story_words (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  story_line_id uuid not null references public.lesson_story_lines(id) on delete cascade,
  position integer not null check (position > 0),
  surface text not null check (char_length(surface) > 0),
  reading text not null check (char_length(reading) > 0),
  meaning text not null check (char_length(meaning) > 0),
  script_type text not null check (script_type in ('kanji', 'hiragana', 'katakana')),
  meaning_score integer not null default 100 check (meaning_score between 0 and 100),
  recognition_score integer not null default 100 check (recognition_score between 0 and 100),
  pronunciation_score integer not null default 100 check (pronunciation_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_line_id, position)
);

create index if not exists lesson_story_words_version_idx
  on public.lesson_story_words (lesson_version_id, story_line_id, position);

alter table public.lesson_story_words enable row level security;

drop policy if exists lesson_story_words_public_read on public.lesson_story_words;
create policy lesson_story_words_public_read
  on public.lesson_story_words for select to anon, authenticated
  using (
    exists (
      select 1
      from public.lessons lesson
      where lesson.status = 'published'
        and lesson.current_version_id = lesson_story_words.lesson_version_id
    )
  );

drop policy if exists lesson_story_words_active_session_read on public.lesson_story_words;
create policy lesson_story_words_active_session_read
  on public.lesson_story_words for select to authenticated
  using (
    exists (
      select 1
      from public.lesson_sessions session
      where session.lesson_version_id = lesson_story_words.lesson_version_id
        and session.user_id = auth.uid()
        and session.status = 'active'
    )
  );

drop policy if exists lesson_story_words_staff_all on public.lesson_story_words;
create policy lesson_story_words_staff_all
  on public.lesson_story_words for all to authenticated
  using (public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (public.has_app_role(array['admin','content_editor']::public.app_role[]));

grant select on public.lesson_story_words to anon, authenticated;
grant insert, update, delete on public.lesson_story_words to authenticated;

drop trigger if exists lesson_story_words_updated_at on public.lesson_story_words;
create trigger lesson_story_words_updated_at
  before update on public.lesson_story_words
  for each row execute function public.set_updated_at();

insert into public.lesson_story_words
  (lesson_version_id, story_line_id, position, surface, reading, meaning, script_type)
select
  line.lesson_version_id,
  line.id,
  word.position,
  word.surface,
  word.reading,
  word.meaning,
  word.script_type
from (
  values
    ('16000000-0000-4000-8000-000000000001'::uuid, 1, '朝', 'あさ', 'morning', 'kanji'),
    ('16000000-0000-4000-8000-000000000001'::uuid, 2, 'ゆきさん', 'ゆきさん', 'Yuki', 'hiragana'),
    ('16000000-0000-4000-8000-000000000001'::uuid, 3, 'は', 'は', 'topic marker', 'hiragana'),
    ('16000000-0000-4000-8000-000000000001'::uuid, 4, '六時半', 'ろくじはん', '6:30', 'kanji'),
    ('16000000-0000-4000-8000-000000000001'::uuid, 5, 'に', 'に', 'at / to', 'hiragana'),
    ('16000000-0000-4000-8000-000000000001'::uuid, 6, '起きます', 'おきます', 'wake up', 'kanji'),
    ('16000000-0000-4000-8000-000000000002'::uuid, 1, 'コーヒー', 'コーヒー', 'coffee', 'katakana'),
    ('16000000-0000-4000-8000-000000000002'::uuid, 2, 'を', 'を', 'object marker', 'hiragana'),
    ('16000000-0000-4000-8000-000000000002'::uuid, 3, '飲み', 'のみ', 'drink', 'kanji'),
    ('16000000-0000-4000-8000-000000000002'::uuid, 4, 'ながら', 'ながら', 'while doing', 'hiragana'),
    ('16000000-0000-4000-8000-000000000002'::uuid, 5, 'ニュース', 'ニュース', 'news', 'katakana'),
    ('16000000-0000-4000-8000-000000000002'::uuid, 6, 'を', 'を', 'object marker', 'hiragana'),
    ('16000000-0000-4000-8000-000000000002'::uuid, 7, '読みます', 'よみます', 'read', 'kanji'),
    ('16000000-0000-4000-8000-000000000003'::uuid, 1, '音楽', 'おんがく', 'music', 'kanji'),
    ('16000000-0000-4000-8000-000000000003'::uuid, 2, 'を', 'を', 'object marker', 'hiragana'),
    ('16000000-0000-4000-8000-000000000003'::uuid, 3, '聞き', 'きき', 'listen', 'kanji'),
    ('16000000-0000-4000-8000-000000000003'::uuid, 4, 'ながら', 'ながら', 'while doing', 'hiragana'),
    ('16000000-0000-4000-8000-000000000003'::uuid, 5, '駅', 'えき', 'station', 'kanji'),
    ('16000000-0000-4000-8000-000000000003'::uuid, 6, 'まで', 'まで', 'as far as', 'hiragana'),
    ('16000000-0000-4000-8000-000000000003'::uuid, 7, '歩きます', 'あるきます', 'walk', 'kanji'),
    ('16000000-0000-4000-8000-000000000004'::uuid, 1, '改札', 'かいさつ', 'ticket gate', 'kanji'),
    ('16000000-0000-4000-8000-000000000004'::uuid, 2, 'で', 'で', 'at / by means of', 'hiragana'),
    ('16000000-0000-4000-8000-000000000004'::uuid, 3, '同僚', 'どうりょう', 'colleague', 'kanji'),
    ('16000000-0000-4000-8000-000000000004'::uuid, 4, 'の', 'の', 'possessive marker', 'hiragana'),
    ('16000000-0000-4000-8000-000000000004'::uuid, 5, '田中さん', 'たなかさん', 'Mr. Tanaka', 'kanji'),
    ('16000000-0000-4000-8000-000000000004'::uuid, 6, 'に', 'に', 'to', 'hiragana'),
    ('16000000-0000-4000-8000-000000000004'::uuid, 7, '会います', 'あいます', 'meet', 'kanji')
) as word(story_line_id, position, surface, reading, meaning, script_type)
join public.lesson_story_lines line on line.id = word.story_line_id
on conflict (story_line_id, position) do update set
  surface = excluded.surface,
  reading = excluded.reading,
  meaning = excluded.meaning,
  script_type = excluded.script_type,
  updated_at = now();

update public.lesson_story_lines line
set tappable_terms = words.terms,
    updated_at = now()
from (
  select story_line_id, array_agg(surface order by position) as terms
  from public.lesson_story_words
  group by story_line_id
) words
where line.id = words.story_line_id;
