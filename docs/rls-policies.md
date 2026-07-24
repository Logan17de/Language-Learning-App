# Row Level Security

Every public application table has RLS enabled.

## Learners

Learners can read/update their own profile-safe rows, preferences, settings, active sessions, answers, events, mastery, review data, custom requests, reports, and tickets. Completion, review result, achievement, and reward rows are readable by their owner but created through trusted database functions.

Only published, non-archived lessons and the current published version/children are publicly readable. Public feature flags require `public = true`.

## Staff roles

- `admin`: users, subscriptions, content, operations, support, audit, costs
- `content_editor`: content, curriculum, assets, validation, publishing; no user suspension, billing, or costs
- `support`: tickets/reports and limited profile context; no content/subscription writes

`current_app_role()` and `has_app_role()` read the active profile under a fixed search path. Client flags do not grant access.

## Audit and storage

Normal authenticated users have no audit insert policy. Trusted server routes verify the actor then use the server-only administrative client.

Storage policies separate public lesson images, authenticated lesson audio, staff uploads, and private per-user export paths.

Run `npm run db:validate` to verify table/RLS coverage, trusted functions, the reward constraint, and absence of unrestricted authenticated `USING (true)` policies.
