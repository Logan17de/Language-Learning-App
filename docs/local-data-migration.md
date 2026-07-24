# Local data migration

The migration assistant is opt-in and runs only in backend mode for an authenticated profile whose `legacy_imported_at` is null.

## Preview

`migration-validation.ts` parses the Zustand envelope safely and counts valid completed lessons, mastery items, review queue items, achievements, generated custom lessons, and skipped records. Invalid JSON or a missing `state` object is rejected.

## Merge behavior

The `import_legacy_progress(jsonb)` transaction:

1. locks out a second import after the profile marker is set;
2. inserts preferences/settings only when no server row exists;
3. maps legacy lesson IDs to canonical backend lessons and versions;
4. imports historical completions with zero new XP;
5. inserts mastery, queue, and achievements with `ON CONFLICT DO NOTHING`;
6. records `legacy_imported_at`;
7. returns canonical imported/skipped counts.

Existing server records win, so an older device cannot silently overwrite newer account data. Historical imports never pass through the reward function and therefore cannot mint XP.

Generated frontend lessons are counted and preserved locally but intentionally skipped from automatic canonical publication. They require the Phase 5 validation/publishing workflow before becoming shared content.
