-- Simplify learner mastery to one weighted score derived from the three
-- teaching dimensions. Confidence/evidence_count remain as compatibility
-- columns for older code, but they no longer decide mastery or learned state.

create or replace function public.weighted_learner_mastery(
  p_meaning integer,
  p_recognition integer,
  p_pronunciation integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select round(
    greatest(0, least(100, coalesce(p_meaning, 0))) * 0.40
    + greatest(0, least(100, coalesce(p_recognition, 0))) * 0.40
    + greatest(0, least(100, coalesce(p_pronunciation, 0))) * 0.20
  )::integer
$$;

create or replace function public.enforce_weighted_learner_mastery()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.mastery := public.weighted_learner_mastery(
    new.meaning_score,
    new.recognition_score,
    new.pronunciation_score
  );
  new.next_review_at := case
    when new.mastery < 60 then now()
    when new.mastery < 80 then now() + interval '1 day'
    else now() + interval '7 days'
  end;
  return new;
end
$$;

drop trigger if exists learner_mastery_weighted_score
  on public.learner_mastery;
create trigger learner_mastery_weighted_score
before insert or update of meaning_score, recognition_score, pronunciation_score, mastery
on public.learner_mastery
for each row execute function public.enforce_weighted_learner_mastery();

-- Recalculate every existing learner item to the new 40/40/20 formula.
update public.learner_mastery
set mastery = public.weighted_learner_mastery(
  meaning_score,
  recognition_score,
  pronunciation_score
);

-- Learned means mastery >= 80. Keep review_queue aligned with that definition
-- regardless of the older confidence-based status calculation in legacy RPCs.
create or replace function public.enforce_review_queue_mastery_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mastery integer;
begin
  if new.status = 'archived' then
    return new;
  end if;

  select mastery
  into v_mastery
  from public.learner_mastery
  where user_id = new.user_id
    and item_type = new.item_type
    and item_key = new.item_key;

  if coalesce(v_mastery, 0) >= 80 then
    new.status := 'mastered';
  elsif new.status = 'mastered' then
    new.status := case
      when new.due_at <= now() then 'due'
      else 'scheduled'
    end;
  end if;

  return new;
end
$$;

drop trigger if exists review_queue_mastery_status
  on public.review_queue;
create trigger review_queue_mastery_status
before insert or update of status, due_at, item_type, item_key
on public.review_queue
for each row execute function public.enforce_review_queue_mastery_status();

create or replace function public.sync_review_queue_from_mastery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$;
begin
  update public.review_queue
  set status = case
        when new.mastery >= 80 then 'mastered'
        when status = 'mastered' and due_at <= now() then 'due'
        when status = 'mastered' then 'scheduled'
        else status
      end,
      due_at = new.next_review_at,
      updated_at = now()
  where user_id = new.user_id
    and item_type = new.item_type
    and item_key = new.item_key
    and status <> 'archived';

  return new;
end
$$;

drop trigger if exists learner_mastery_sync_review_queue
  on public.learner_mastery;
create trigger learner_mastery_sync_review_queue
after insert or update of mastery
on public.learner_mastery
for each row execute function public.sync_review_queue_from_mastery();

-- Align existing queue rows immediately.
update public.review_queue queue
set status = case
      when mastery.mastery >= 80 then 'mastered'
      when queue.status = 'mastered' and mastery.next_review_at <= now() then 'due'
      when queue.status = 'mastered' then 'scheduled'
      else queue.status
    end,
    due_at = coalesce(mastery.next_review_at, queue.due_at),
    updated_at = now()
from public.learner_mastery mastery
where mastery.user_id = queue.user_id
  and mastery.item_type = queue.item_type
  and mastery.item_key = queue.item_key
  and queue.status <> 'archived';

comment on function public.weighted_learner_mastery(integer, integer, integer) is
  'Mastery = 40% meaning + 40% recognition + 20% pronunciation. Mastery >= 80 is learned.';
