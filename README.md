# AIko — adaptive Japanese learning

AIko combines “AI” with `ko` (子, child). The application includes the learner experience, seven-phase lesson player, adaptive review, backend lesson assignment, Pro custom-topic generation, progress analytics, and an operations workspace.

## Architecture

- Next.js 16 App Router and React 19
- Zustand for transient, optimistic, and legacy local state
- Supabase Auth, PostgreSQL, Row Level Security, and Storage in backend mode
- Typed repositories under `lib/repositories`; UI components never instantiate Supabase clients
- Transactional PostgreSQL functions for lesson/review completion, rewards, publishing, reset, and legacy import
- Canonical published lessons loaded from Supabase in backend mode; bundled lessons remain the demo fallback

More detail is in [backend architecture](docs/backend-architecture.md), [database schema](docs/database-schema.md), [RLS policies](docs/rls-policies.md), and [local data migration](docs/local-data-migration.md).

## Development modes

### Demo mode

Leave the Supabase variables unset:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. In development, a banner states that AIko is running in local demo mode. Existing deterministic learner/admin flows and localStorage persistence remain available.

Demo admin credentials:

- Email: `admin@aiko.local`
- Password: `admin123`

### Backend mode

Copy `.env.example` to `.env.local` and set:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_LESSON_MODEL=gpt-5.6
```

`SUPABASE_SERVICE_ROLE_KEY` is imported only by server-only modules and trusted route handlers. Never expose it through a `NEXT_PUBLIC_` variable.

Start a local Supabase stack (Docker Desktop must be running):

```bash
npm run db:start
npm run db:reset
npm run db:types
npm run dev
```

Supabase Studio is available at `http://127.0.0.1:54323` with the local configuration in `supabase/config.toml`.

## Database commands

```bash
npm run db:start       # start local Supabase containers
npm run db:stop        # stop them
npm run db:reset       # rebuild schema and run supabase/seed.sql
npm run db:seed        # deterministic reset + seed
npm run db:types       # regenerate types/database.ts
npm run db:validate    # static schema/RLS/function contract validation
npm run seed:validate  # deterministic seed validation
```

The seed includes JLPT levels, vocabulary, kanji, grammar, assets, operational records, achievements, and the playable “Going to Work” lesson with deterministic IDs.

## Lesson assignment and generation

- Learners never submit a lesson ID for selection. `assign_next_lesson()` chooses and records one current-level lesson.
- Free accounts receive a random eligible lesson at their JLPT level; profile interests are intentionally ignored.
- Pro accounts rank eligible current-level lessons using profile interests.
- A unique learner/lesson assignment prevents any assigned lesson from being selected again.
- Lesson-session inserts require a valid active assignment through a restrictive RLS policy.
- Pro custom topics use the server-only OpenAI Responses API with Structured Outputs. The validated seven-stage package is persisted, privately scoped to its owner, and immediately assigned.
- Review evidence reports strengths and weaknesses and automatically drives the learning system; there is no learner-managed lesson starring.

## Authentication and admin setup

Sign-up creates the Auth user and the `profiles`, `user_preferences`, `user_settings`, and `user_subscriptions` records through a database trigger. Email/password login, Google OAuth, logout, password recovery, PKCE callback exchange, session refresh, and protected routes use the Supabase SSR pattern.

To enable Google sign-in:

1. Create a Google OAuth web client and add the Supabase callback URL shown in **Supabase Dashboard → Authentication → Providers → Google**.
2. Add the Google client ID and secret to that provider and enable it.
3. Add `http://localhost:3000/auth/callback` and the production `https://<your-domain>/auth/callback` URL to **Authentication → URL Configuration → Redirect URLs**.
4. Set `NEXT_PUBLIC_APP_URL` to the matching deployment origin in each Vercel environment.

Do not put the Google client secret in this repository or in a `NEXT_PUBLIC_*` variable.

Create an account through `/signup`, then promote it locally in SQL:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@example.com';
```

Supported roles are `learner`, `admin`, `content_editor`, and `support`. The proxy and RLS both enforce permissions. Content editors cannot manage subscriptions or suspensions; support staff cannot publish content.

## Storage

- `lesson-images`: public read; admin/content-editor write
- `lesson-audio`: authenticated read; admin/content-editor write
- `user-exports`: private per-user paths

The seed inserts metadata and placeholder paths only. No production media is uploaded.

## Legacy import

After backend login, AIko checks `aiko-app-state` (and the legacy `kizuna-app-state` fallback). If the server profile has not been imported, the user receives a preview and explicit opt-in prompt. Valid preferences, history, mastery, review items, and achievements merge without overwriting existing server records. Malformed/unsupported records are reported and skipped. See [local data migration](docs/local-data-migration.md).

## Testing and verification

```bash
npm run db:validate
npm run seed:validate
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover scoring validation, migration parsing, canonical lesson merge rules, deterministic review scheduling, idempotency helpers, role permissions, and database security contracts. Production builds do not require a live Supabase project.

## Important routes

- Public: `/`, `/login`, `/signup`, `/forgot-password`, `/auth/callback`, `/reset-password`
- Learner: `/home`, `/learn`, `/review`, `/progress`, `/custom-topic`, `/profile`, `/settings`, `/support`, `/lesson/*`
- Admin: `/admin/*` with a server-verified role gate
- Trusted APIs: `/api/lesson/complete`, `/api/review/complete`, `/api/custom-lessons/generate`, `/api/account/export`, `/api/account/reset-progress`, and role-restricted admin mutation endpoints

## Known Phase 5 limitations

- Speech recognition, TTS, image generation, email delivery, and Stripe are not yet implemented.
- Pro lesson generation requires `OPENAI_API_KEY`; the local demo retains a deterministic no-network fallback.
- Billing state is persisted but remains mocked.
- Account deletion remains a documented future privileged workflow; progress reset is transactional now.
- Local Supabase execution requires Docker. Static migration/seed validation and mocked tests remain available without it.
- Phase 4 local admin fixtures remain as a demo fallback; backend repositories and trusted mutations are the production boundary.
