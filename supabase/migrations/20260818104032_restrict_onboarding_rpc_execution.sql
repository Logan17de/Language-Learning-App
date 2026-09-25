-- Supabase grants execute on exposed public-schema functions to API roles.
-- These learner-owned SECURITY DEFINER RPCs require an authenticated identity,
-- so remove the anonymous API grant explicitly.

revoke execute on function public.assign_next_lesson() from anon;
revoke execute on function public.complete_onboarding(
  text,
  text,
  public.jlpt_level,
  integer,
  text
) from anon;

grant execute on function public.assign_next_lesson() to authenticated;
grant execute on function public.complete_onboarding(
  text,
  text,
  public.jlpt_level,
  integer,
  text
) to authenticated;
