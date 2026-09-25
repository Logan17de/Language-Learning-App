create or replace function public.normalize_custom_lesson_assignment_mode()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.selection_mode = 'pro_custom'
     and new.algorithm_version like 'custom-%' then
    new.selection_mode := 'custom_topic';
  end if;
  return new;
end
$$;

drop trigger if exists lesson_assignments_normalize_custom_mode
on public.lesson_assignments;

create trigger lesson_assignments_normalize_custom_mode
before insert on public.lesson_assignments
for each row
execute function public.normalize_custom_lesson_assignment_mode();
