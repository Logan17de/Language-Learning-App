create or replace function public.mark_free_lesson_entitlement_consumed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.uses_free_daily_entitlement
     and new.generated_lesson_id is not null
     and new.entitlement_consumed_at is null then
    new.entitlement_consumed_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists custom_lesson_requests_consume_free_entitlement
on public.custom_lesson_requests;

create trigger custom_lesson_requests_consume_free_entitlement
before update of generated_lesson_id on public.custom_lesson_requests
for each row
when (new.generated_lesson_id is not null)
execute function public.mark_free_lesson_entitlement_consumed();
