# AIko Japanese — Phases 1–4

AIko is a frontend-first prototype for structured, adaptive Japanese learning. “AIko” combines AI with `ko` (子, child).

The project contains the complete learner experience from Phases 1–3 and the frontend-only Admin and Content Management workspace from Phase 4.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Mock admin access

The admin login is available only at `/admin/login`.

- Email: `admin@aiko.local`
- Password: `admin123`

The session is a local prototype session. It is not real authentication and must be replaced before production use.

## Learner flows

### Core journey

1. Open `/` and create a demo account.
2. Complete onboarding and open `/home`.
3. Browse `/learn`, preview a lesson, and complete all seven phases.
4. Complete a quick review at `/review`.
5. Inspect persisted learning analytics at `/progress`.

### Custom topics and subscription

1. Open `/subscription` and enable the Premium demo plan.
2. Open `/custom-topic`.
3. Try `IT support` for an existing lesson.
4. Try `café` for a variation.
5. Try `agriculture technology` for a generated lesson.
6. Generated lessons appear in `/learn` and in the admin validation queue.

### Reports and support

- Submit a lesson report from a preview, lesson phase, or result.
- Submit a support request at `/support`.
- Both records synchronize into their corresponding admin screens.

Active lessons and reviews survive refresh. Persisted `rewarded` flags keep lesson and review XP rewards idempotent.

## Phase 4 admin routes

- `/admin` — operational dashboard
- `/admin/lessons` — canonical lesson management
- `/admin/lessons/[lessonId]` — lesson detail and preview data
- `/admin/lessons/[lessonId]/edit` — structured lesson editor
- `/admin/generated` and `/admin/generated/[lessonId]` — generated-content validation
- `/admin/curriculum` — JLPT sequences, prerequisites, and lesson coverage
- `/admin/grammar`
- `/admin/vocabulary`
- `/admin/images`
- `/admin/audio`
- `/admin/users` and `/admin/users/[userId]`
- `/admin/subscriptions`
- `/admin/reports` and `/admin/reports/[reportId]`
- `/admin/support` and `/admin/support/[requestId]`
- `/admin/analytics`
- `/admin/costs`
- `/admin/audit-log`
- `/admin/settings`

### Admin test flows

#### Lesson management

1. Sign in at `/admin/login`.
2. Open `/admin/lessons`.
3. Edit a published lesson and save it.
4. Preview it through the existing learner preview.
5. Publish the lesson.
6. Open `/learn` and confirm the title/content reflects the canonical admin override.

#### Generated validation

1. Create a custom lesson from `/custom-topic`.
2. Open `/admin/generated`.
3. Open the generated lesson and inspect all validation categories.
4. Approve, then publish it.
5. Confirm it remains playable and visible in `/learn`.

#### Report and support operations

1. Submit a learner lesson report and support request.
2. Open `/admin/reports` and change the report from New to Investigating, then Fixed.
3. Add an internal note and record a mock user notification.
4. Open `/admin/support`, add a mock reply, and resolve the ticket.
5. Refresh to confirm persistence.

#### User and audit integration

1. Open Hana at `/admin/users/user_hana_001`.
2. Change the mock plan.
3. Confirm `/custom-topic` gating reflects the new plan.
4. Suspend and restore the account or reset mock progress.
5. Open `/admin/audit-log` and confirm each mutation was recorded.

## Data and persistence

Learner state is stored under `aiko-app-state`, currently at version 3. It retains backward compatibility with older AIko state and the legacy `kizuna-app-state` key.

Admin state is stored separately under `aiko-admin-state`, currently at version 2. The store is split across:

- `store/admin-store.ts`
- `store/admin-store-types.ts`
- `store/admin-store-migrations.ts`

Canonical lesson content is assembled from:

1. Curated seed lessons.
2. Phase 3 generated lessons in the learner store.
3. Persisted admin lesson overrides.
4. Persisted admin deletions.

The learner library displays only canonical lessons with `published` status. Admin edits do not create a disconnected learner copy. Publishing an override immediately changes learner discovery and lesson resolution.

Generated lessons, learner reports, support requests, and the primary learner’s subscription remain in the learner store. Admin workflow metadata—validation, report status, ticket conversations, audit history, and settings—stays in the admin store and references learner entity IDs.

Both stores use localStorage-safe fallbacks and versioned migration functions.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

No backend, database, authentication provider, AI API, payment API, cloud storage, analytics provider, or external operational service is connected.
