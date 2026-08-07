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

The mock admin is development-only. Production `/admin*` routes fail closed if Supabase is not configured.

### Backend mode

Copy `.env.example` to `.env.local` and set:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# Legacy alternative: NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_LESSON_MODEL=gpt-5.6-luna
OPENAI_STORY_REASONING_EFFORT=low
OPENAI_VALIDATOR_REASONING_EFFORT=medium
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

`SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` are imported only by server-only modules and trusted route handlers. Never expose either through a `NEXT_PUBLIC_` variable.

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
- Pro custom topics use the server-only OpenAI Responses API with GPT-5.6 Luna and JSON Schema output. The story is the first isolated model call. AIko then resolves only vocabulary already present in the permanent library and attaches those records as taps; unresolved story text remains plain text and never triggers an enrichment model call or library write. Activity regions are generated in parallel, approved questions survive unchanged, and only rejected questions are repaired. Responses are stateless (`store: false`), and an alternate model is used only when `OPENAI_LESSON_FALLBACK_MODEL` is explicitly configured.
- Review evidence reports strengths and weaknesses and automatically drives the learning system; there is no learner-managed lesson starring.

## Authentication and owner admin setup

Sign-up creates the Auth user and the `profiles`, `user_preferences`, `user_settings`, and `user_subscriptions` records through a database trigger. Email/password login, Google OAuth, logout, password recovery, PKCE callback exchange, session refresh, and protected routes use the Supabase SSR pattern.

To enable Google sign-in:

1. Create a Google OAuth web client and add the Supabase callback URL shown in **Supabase Dashboard → Authentication → Providers → Google**.
2. Add the Google client ID and secret to that provider and enable it.
3. Add `http://localhost:3000/auth/callback` and the production `https://<your-domain>/auth/callback` URL to **Authentication → URL Configuration → Redirect URLs**.
4. In Vercel, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. AIko also accepts the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. In Vercel, set `NEXT_PUBLIC_APP_URL=https://language-learning-app-kappa-dusky.vercel.app`. Never leave this variable pointing to localhost in a production environment. Browser-started auth also uses the current page origin as a safeguard.

Do not put the Google client secret in this repository or in a `NEXT_PUBLIC_*` variable.

Production administration is restricted to a single Supabase Auth user stored in `public.admin_owner`. On an existing database, the owner-only migration seeds that record automatically only when exactly one active `admin` profile exists. Otherwise it leaves the owner unset and all admin authorization fails closed.

On a fresh database, create your account first and then configure the owner from the trusted Supabase SQL editor:

```sql
begin;

update public.profiles
set role = 'admin'
where email = 'YOUR_EMAIL'
  and status = 'active';

insert into public.admin_owner (singleton, user_id)
select true, id
from public.profiles
where email = 'YOUR_EMAIL'
  and role = 'admin'
  and status = 'active'
on conflict (singleton) do update
set user_id = excluded.user_id;

commit;
```

Verify it with:

```sql
select p.id, p.email, p.role, p.status
from public.admin_owner o
join public.profiles p on p.id = o.user_id
where o.singleton = true;
```

The schema still contains `learner`, `admin`, `content_editor`, and `support` enum values for compatibility, but production operational access is owner-admin only. Client state and profile role strings are not sufficient authorization; Proxy, server authorization, and RLS independently enforce the boundary.

## Storage

- `lesson-images`: public read; owner-admin write
- `lesson-audio`: authenticated read; owner-admin write
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

Tests cover scoring validation, migration parsing, canonical lesson merge rules, deterministic review scheduling, idempotency helpers, owner-only permissions, and database security contracts. Production builds do not require a live Supabase project.

## Important routes

- Public: `/`, `/login`, `/signup`, `/forgot-password`, `/auth/callback`, `/reset-password`
- Learner: `/home`, `/learn`, `/review`, `/progress`, `/custom-topic`, `/profile`, `/settings`, `/support`, `/lesson/*`
- Admin: `/admin/*` with an owner-only server/database authorization boundary
- Trusted APIs: `/api/lesson/complete`, `/api/review/complete`, `/api/custom-lessons/generate`, `/api/account/export`, `/api/account/reset-progress`, and owner-restricted admin mutation endpoints

## Known Phase 5 limitations

- Speech recognition, TTS, image generation, email delivery, and Stripe are not yet implemented.
- Pro lesson generation requires `OPENAI_API_KEY`; apply all Supabase migrations so the universal package is retained in lesson-version metadata.
- Billing state is persisted but remains mocked.
- Account deletion remains a documented future privileged workflow; progress reset is transactional now.
- Local Supabase execution requires Docker. Static migration/seed validation and mocked tests remain available without it.
- Phase 4 local admin fixtures remain available only as a development/demo fallback; backend repositories and trusted mutations are the production boundary.
