# Backend architecture

## Runtime boundary

`lib/supabase/client.ts` creates the browser client, `lib/supabase/server.ts` creates a request-scoped server client, and `lib/supabase/admin.ts` is the server-only service-role entry point. `proxy.ts` refreshes Auth cookies and provides an early route filter.

Authenticated learner and admin flows require Supabase configuration. Missing or placeholder backend configuration fails closed; the application does not promote localStorage, bundled lessons, mock users, or demo credentials into an alternate authenticated mode.

## Authorization

Production administration is owner-only. The database stores one protected `admin_owner` user ID and `current_app_role()` returns effective admin access only for that active Supabase user. Legacy enum values may remain in schema history for compatibility, but they do not create a client-side authorization path.

Proxy is an early filter, not the final boundary. Sensitive authorization is repeated at the server/data layer:

- `/admin/*` restores and verifies the Supabase identity before rendering the workspace.
- trusted mutation routes call server authorization before service-role access.
- RLS policies enforce database access independently of the UI.
- client state, localStorage, hidden navigation, profile strings, and OAuth metadata never grant admin authority.

## Learner data flow

UI components call typed repositories/application services. Zustand stores transient UI state, active lesson interaction, and local lesson checkpoints, but Supabase is authoritative for authenticated identity, profile data, assignment, progress, content, subscriptions, and persisted learning evidence.

Persisted client state is not accepted as proof of authentication. Backend session hydration verifies the current Supabase user before protected learner screens render.

Lessons are assigned and loaded through the backend lesson repository/store. There is no bundled/mock lesson fallback on protected learner routes.

## Lesson sessions and mastery

Active lesson sessions persist checkpoints, answers, events, and mastery evidence. Offline checkpoint/completion failures may enter the bounded local sync queue and retry when connectivity returns. Database idempotency protects completion/reward reconciliation.

Standalone Quick Review has been retired. Weak-item/mastery records remain internal learning evidence and targeting data; the learner application does not maintain a separate review session/runtime.

## Custom lesson generation

Custom-topic generation is a durable staged job:

1. select lesson plan/targets;
2. generate the story;
3. match original-story tappable vocabulary against the curated JLPT CSV catalog;
4. resolve library identities;
5. generate the three persisted activity groups;
6. validate/assemble the playable package;
7. save the lesson;
8. prepare audio without blocking lesson availability.

The worker claims stages atomically from PostgreSQL. Successful checkpoints are durable and retries regenerate only missing/invalid work. Supabase `pg_cron` + `pg_net` invoke the protected worker using endpoint/secret values stored in Vault.

Story tappability does not use JMdict or an AI enrichment pass. Later reading/listening/speaking generation does not create additional vocabulary records.

## Trusted mutations

PostgreSQL functions and trusted server routes cover operations such as:

- lesson completion and reward reconciliation;
- lesson publication/versioning;
- transactional learner progress reset;
- custom-generation claims/checkpoints/storage;
- admin user/subscription/report/support/service operations;
- authenticated data export and reset operations.

Historical migrations may contain functions for systems that have since been retired. Migration history is forward-only and should not be read as a list of currently exposed application features.

## Failure behavior

Missing backend configuration, expired authentication, or failed authorization does not fall back to prototype data. Learner/admin protected routes fail closed and repositories return explicit errors. A queued local checkpoint is not represented as synced until its backend write succeeds.
