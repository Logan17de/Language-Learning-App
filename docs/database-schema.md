# Database schema

The initial schema is normalized across 45 RLS-enabled tables.

## Identity

`profiles` mirrors `auth.users.id` and owns role, account status, subscription summary, XP, streak, and study totals. Preferences, settings, and subscription lifecycle records are separate tables.

## Curriculum and lessons

JLPT curriculum, grammar, kanji, and vocabulary are reusable records. `lessons` is the stable identity. `lesson_versions` is immutable published content. Story, vocabulary, grammar, reading, listening, speaking, review, and asset links are normalized by version.

Publication clones the current version and its children in one transaction, advances `current_version_id`, and retains prior versions for active sessions and reports.

## Progress and review

Sessions, answers, events, completions, mastery, review queue/sessions/results, achievements, and daily aggregates are separate records. The summary views avoid rebuilding expensive aggregates on every render:

- `learner_progress_summary`
- `learner_weekly_activity`
- `learner_weak_items`
- `lesson_performance_summary`
- `admin_dashboard_summary`

## Workflows and operations

Custom requests are ready for queued deterministic matching and future generation jobs/validation. Reports pin lesson/version/activity context. Support uses tickets and messages. Audit records, feature flags, service status, costs, and the reward ledger support operations.

## Idempotency

`reward_ledger` has a unique `(reward_type, source_id)` constraint. Completion functions lock the session, return an existing canonical result on retries, insert the ledger before applying aggregates, and award XP/study time once.
