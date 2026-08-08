alter table public.lesson_generation_requests
  add column if not exists edited_raw_response text;

comment on column public.lesson_generation_requests.edited_raw_response is
  'Latest owner-edited lesson text, preserved even when it is not valid JSON yet.';
