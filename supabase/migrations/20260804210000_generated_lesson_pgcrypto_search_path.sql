-- The vocabulary-capacity migration recreates the V2 storage function from
-- pg_proc. Restore the extension schema used by pgcrypto so its digest(text,
-- text) overload remains resolvable during final package signature creation.

alter function public.store_generated_lesson_package_v2(uuid, jsonb, integer)
  set search_path = public, extensions;

comment on function public.store_generated_lesson_package_v2(
  uuid, jsonb, integer
) is
  'Stores generated lesson packages with full enrichment and a pgcrypto-backed content signature.';
