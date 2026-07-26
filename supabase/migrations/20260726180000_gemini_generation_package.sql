-- Retain the complete schema-validated Gemini package after the compatibility
-- adapter has populated the existing lesson content tables.

create or replace function public.attach_generated_lesson_package(
  p_request_id uuid,
  p_lesson_version_id uuid,
  p_generation_package jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_generation_package) <> 'object'
     or coalesce((p_generation_package->>'schemaVersion')::integer, 0) <> 1
     or jsonb_typeof(p_generation_package->'blueprint') <> 'object'
     or jsonb_typeof(p_generation_package->'story') <> 'object'
     or jsonb_typeof(p_generation_package->'vocabulary') <> 'object'
     or jsonb_typeof(p_generation_package->'grammar') <> 'object'
     or jsonb_typeof(p_generation_package->'listening') <> 'object'
     or jsonb_typeof(p_generation_package->'speaking') <> 'object'
     or jsonb_typeof(p_generation_package->'interactive') <> 'object' then
    raise exception 'Invalid universal generation package' using errcode = '22023';
  end if;

  update public.lesson_versions as version
  set metadata = coalesce(version.metadata, '{}'::jsonb)
    || jsonb_build_object('generationPackage', p_generation_package)
  from public.lessons as lesson, public.custom_lesson_requests as request
  where version.id = p_lesson_version_id
    and lesson.id = version.lesson_id
    and lesson.generated_for_user_id = auth.uid()
    and request.id = p_request_id
    and request.user_id = auth.uid()
    and request.generated_lesson_id = lesson.id;

  if not found then
    raise exception 'Generated lesson package unavailable' using errcode = '42501';
  end if;
  return true;
end
$$;

revoke all on function public.attach_generated_lesson_package(uuid, uuid, jsonb) from public;
grant execute on function public.attach_generated_lesson_package(uuid, uuid, jsonb) to authenticated;
