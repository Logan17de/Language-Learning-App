# Backend architecture

## Runtime split

`lib/supabase/client.ts` creates the cookie-aware browser client. `lib/supabase/server.ts` creates a request-scoped server client. `lib/supabase/admin.ts` is marked `server-only` and is the only service-role entry point. `proxy.ts` refreshes Auth cookies and protects learner/admin paths.

The browser selects a mode from public environment variables:

- Supabase configured: authenticated backend mode
- Supabase absent/placeholder: deterministic demo mode

## Data flow

UI components call typed repositories or application services. Repositories normalize errors into `RepositoryResult<T>` and never return raw Supabase response objects. Zustand retains active lesson interaction, optimistic UI, and cached summaries, but Supabase is authoritative for authenticated persistent data.

Published backend lessons are reconstructed from a lesson identity, immutable current version, and normalized child rows. Active sessions store both `lesson_id` and `lesson_version_id`, so a later publication cannot alter an in-progress attempt.

Lesson checkpoints save on meaningful changes and every ten elapsed seconds. Event/answer payloads remain batched in the checkpoint. Offline failures enter a bounded local queue with dedupe keys. An online event retries the queue; database reward idempotency makes reconciliation safe.

## Trusted mutations

PostgreSQL functions handle:

- lesson completion and reward claim
- review completion and reward claim
- lesson publication/version cloning
- transactional progress reset
- one-time legacy import

Trusted route handlers handle operations that require server-side validation or service-role writes, including admin audit creation, user status, subscription changes, report status, support replies, export, and reset.

## Failure behavior

Missing configuration activates explicit demo mode. Repository errors distinguish missing configuration, expired authentication, permission denial, conflict, missing records, offline state, and retryable unknown failures. Public bundled content remains available in demo mode. Backend mode does not claim a queued change is synced until the repository succeeds.
