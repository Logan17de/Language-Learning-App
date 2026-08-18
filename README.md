# AIko — adaptive language learning

AIko is a language-learning application built around connected lessons, durable custom-lesson generation, learner mastery, and a private owner-admin workspace. Japanese is the first supported language.

The canonical production origin is **https://aiko.zetbros.com**. Generated Vercel deployment hostnames are infrastructure addresses, not public AIko URLs.

The repository is production-oriented. Supabase is the source of truth for authentication, learner data, lesson assignment, progress, content, and administration. Missing backend configuration fails closed; there is no local demo-login or mock production fallback.

## Stack

- Next.js 16 App Router + React 19
- TypeScript
- Zustand for transient client/session UI state and lesson checkpoints
- Supabase Auth + PostgreSQL + Row Level Security + Storage
- OpenAI Responses API for generated lesson content
- Supabase `pg_cron` + `pg_net` + Vault for durable custom-lesson worker scheduling

## Learner lesson flow

The canonical learner order is:

1. Story
2. Vocabulary + kanji
3. Grammar
4. Reading
5. Listening
6. Speaking

Standalone Quick Review has been retired. Mastery evidence is recorded internally from lesson activity and is used for targeting/progress rather than exposed as a separate learner-managed review queue.

Learner lessons are loaded and assigned through Supabase. The browser does not fall back to bundled/mock lessons when the backend is missing.

## Custom-topic generation

A learner supplies only a topic and JLPT level. Generation is a durable, resumable server pipeline rather than one long browser request.

Current high-level flow:

1. Select lesson targets and learner context.
2. Generate the Japanese story.
3. Match tappable vocabulary against the curated JLPT CSV catalogs under `Vocabs/`.
4. Resolve target/library identities.
5. Generate vocabulary + kanji activities.
6. Generate grammar + reading activities.
7. Generate listening + speaking activities.
8. Validate and assemble the playable lesson.
9. Persist the lesson.
10. Prepare audio without blocking lesson availability.

Important constraints:

- Story tappability uses the curated JLPT vocabulary catalog only.
- JMdict is not part of the active lesson-generation lookup path.
- Unmatched story text remains plain text; missing vocabulary does not force story regeneration.
- Later reading/listening/speaking regions do not run extra vocabulary enrichment passes.
- Kanji/grammar catalog records used as targets are identities; lesson-specific teaching material is generated in the lesson activities.
- Generation checkpoints are persisted so interrupted work resumes instead of restarting successful stages.
- The protected worker is invoked by Supabase scheduling; Vercel Cron is not used.

## Authentication

Learner and admin authentication use Supabase Auth. Protected routes do not trust persisted client state as proof of authentication.

Google OAuth requires the provider to be enabled in Supabase and the application callback URL to be registered. The canonical production callback base is `https://aiko.zetbros.com`; staging and localhost redirects are allowed separately for testing. Email/password authentication is also supported when enabled in Supabase.

The owner-admin workspace is restricted by server-side authorization and database policy. Client role strings are not an authorization boundary.

## Environment

Create `.env.local` from `.env.example` and configure the values required by the environment. The important production variables include:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# Legacy accepted alternative:
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://aiko.zetbros.com
OPENAI_API_KEY=
CUSTOM_LESSON_WORKER_SECRET=
```

Production code treats `https://aiko.zetbros.com` as the canonical origin even if a stale Vercel URL remains in `NEXT_PUBLIC_APP_URL`. Preview deployments remain independently testable.

Additional model/transcription variables are documented in `.env.example`.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, or worker secrets through a `NEXT_PUBLIC_*` variable.

## Supabase worker setup

The custom-lesson scheduler reads its endpoint and bearer value from Supabase Vault:

- `custom_lesson_worker_url`
- `custom_lesson_worker_secret`

For production, `custom_lesson_worker_url` is `https://aiko.zetbros.com/api/internal/custom-lessons/process`. The bearer secret must match the server-only `CUSTOM_LESSON_WORKER_SECRET` configured for the deployment.

See `docs/custom-lesson-worker-scheduler.md` for deployment and diagnostic details.

## Local development

A working Supabase configuration is required for authenticated learner/admin flows.

```bash
npm install
npm run dev
```

For a local Supabase stack, Docker must be running:

```bash
npm run db:start
npm run db:reset
npm run db:types
npm run dev
```

Useful database commands:

```bash
npm run db:start
npm run db:stop
npm run db:reset
npm run db:types
npm run db:validate
npm run seed:validate
```

Do not delete, rewrite, or reorder already-applied Supabase migrations. Schema cleanup should be performed with new forward migrations.

## Validation

Before deployment, run:

```bash
npm run typecheck
npm test
npm run build
npm run db:validate
npm run seed:validate
```

`npm run lint` is also available for repository-wide linting.

## Main routes

Public/auth:

- `/`
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/auth/callback`

Learner:

- `/home`
- `/learn`
- `/progress`
- `/custom-topic`
- `/profile`
- `/settings`
- `/support`
- `/subscription`
- `/lesson/*`

Admin:

- `/admin/*`

Core custom-lesson APIs include:

- `/api/custom-lessons/generate`
- `/api/custom-lessons/status`
- `/api/custom-lessons/complete`
- `/api/internal/custom-lessons/process`

## Repository boundaries

- `app/` — Next.js routes and route handlers
- `components/` — learner/admin UI
- `lib/custom-lessons/` — durable custom-generation orchestration and validation
- `lib/gemini/` — historical directory name for lesson-generation modules; active generation uses the OpenAI structured-output compatibility layer
- `lib/repositories/` — Supabase-backed data access
- `store/` — transient client/session state
- `supabase/migrations/` — forward-only database history
- `Vocabs/` — curated JLPT vocabulary CSV sources used for story tappability
- `tests/` — current behavioral and architecture contracts

Historical migration files may mention retired systems because they represent the database's forward history. They should not be treated as active application architecture and must not be removed merely as code cleanup.
