# Lesson save failures — handover brief

Stack: Next.js 16 App Router, React 19, Zustand (localStorage), Supabase
(Postgres + RLS + SECURITY DEFINER RPCs). Production: `aiko.zetbros.com`.

## Symptom

A yellow banner during a lesson:

> Your previous section is safe on this device, but AIko refused it: This phase
> checkpoint could not be saved. Please try again.

with a **Retry save** button that does not clear it.

## How saving works

Advancing a section calls `commitAndAdvance` in
`components/lesson/lesson-player.tsx`. For any non-final section it queues the
work and advances optimistically:

1. `queueLessonPhaseCompletion` (`lib/sync/backend-sync.ts`) writes a
   `lesson_phase_commit` item to `localStorage` (`aiko-pending-sync-v1`,
   `lib/sync/offline-queue.ts`).
2. `runPendingSync` picks it up and calls `persistPhaseCompletion`, which does,
   in order:
   - `requireBackendContext` → `lessonRepository.getPlayable` then
     `lessonSessionRepository.startOrResume`
   - `saveAnswers` → insert into `lesson_activity_answers`
   - `saveEvents` → insert into `lesson_events`
   - `saveCheckpoint` → **update** `lesson_sessions`
   - `commitPhase` → RPC `commit_lesson_phase`
3. Any step failing marks the queue item with `lastError`, which the banner now
   prints verbatim.

The banner text above comes from step 2's `saveCheckpoint` returning falsy.

## Root cause (identified)

Two changes interact:

**a. One active session per learner.** `start_or_resume_lesson_session`
(migration `20260824064500`) opens the requested lesson and sets every *other*
active session for that learner to `abandoned`. This was added because nothing
ever closed a session — one account held 13 open, the oldest four weeks old.

**b. RLS forbids writing to a non-active session.** On `lesson_sessions`:

```
active_session_update_only   RESTRICTIVE  UPDATE
  USING (user_id = auth.uid() AND status = 'active')
```

Restrictive policies **AND** with the permissive ones, so a learner can only
UPDATE a row whose `status = 'active'`, whatever the query filters on.

So: open lesson B, and the browser still sitting on lesson A can no longer write
its checkpoint. Every attempt matches zero rows, `.single()` errors, and the
banner asks the learner to retry something that cannot succeed.

Confirmed on production: sessions for "The Foolish Thief" (05:54) and "The Queen
at the Park" (05:56) — the second closed the first. Replaying the update as the
learner's own role, with their JWT and RLS live, matched **0 rows** both with
`status = 'active'` and with `status <> 'completed'`.

## Ruled out, with evidence

- **RLS/privileges generally.** Replaying the exact checkpoint update and answer
  insert as the learner's role, against an *active* session, both affect 1 row.
- **Table and column grants.** All 16 `lesson_sessions` columns are updatable by
  `authenticated`; `lesson_activity_answers` and `lesson_events` have
  SELECT+INSERT.
- **The server functions.** `commit_lesson_phase` and `complete_lesson_session`
  behave correctly when called directly with the learner's claims.
- **An earlier, different cause, already fixed:** one permanently-failing queue
  item used to stop the whole queue (`runPendingSync` broke on first failure),
  stranding every lesson's saves. Blocking is now per-lesson.

## Resolved — kept here because it explains the current design

The risk below was real and is now fixed (migration
`20260824100000_a_taken_over_lesson_leaves_the_path.sql`). Being taken over is
final: `start_or_resume_lesson_session` resumes only a still-open session and
refuses a set-aside one, the sync path resolves the session read-only instead
of reopening it, and the browser left behind stops the lesson and says so.
Option 1 below is what was built, with option 2 alongside it.



`persistPhaseCompletion` starts with `requireBackendContext`, which calls
`startOrResume` → `start_or_resume_lesson_session`. That **reactivates** the
lesson it is saving for, and abandons the others.

So a retry from a stale tab does not just fail — it can steal the active slot
back. With two tabs on two lessons, each one's retry loop reactivates its own
lesson and closes the other's. Neither settles.

This has not been reproduced deliberately; it is read from the code. It is the
most likely remaining source of "buggy across two browsers".

Options considered:

1. **Do not reactivate on a queue retry.** Give `persistPhaseCompletion` a
   context lookup that resolves the existing session without changing status,
   and let only explicit user navigation call the reactivating RPC. Removes the
   ping-pong; a stale tab then simply cannot save until reopened.
2. **Make the stale case terminal in the UI.** Detect a closed session and stop
   retrying, telling the learner to reopen the lesson. Currently the message
   says this, but the item stays queued and keeps retrying.
3. **Relax the restrictive policy** to allow checkpoint writes to abandoned (not
   completed) sessions. Rejected here: the policy is a deliberate guard, and
   letting a stale tab write would reintroduce two sources of truth.

Option 1 is the recommended direction.

## Reproducing

1. Sign in, open lesson A, finish the Story section (do not leave the tab).
2. In a second browser or profile, sign in as the same learner and open lesson B.
3. Back in tab A, advance a section. The banner appears.

## Useful queries

```sql
-- Open sessions per learner (should be at most 1)
select user_id, count(*) filter (where status='active') as open_now
from public.lesson_sessions group by user_id order by open_now desc;

-- Is anything reaching the server at all?
select 'answers' k, count(*), max(created_at) from public.lesson_activity_answers
where created_at > now() - interval '24 hours'
union all select 'events', count(*), max(created_at) from public.lesson_events
where created_at > now() - interval '24 hours'
union all select 'commits', count(*), max(committed_at)
from public.lesson_phase_mastery_commits where committed_at > now() - interval '24 hours';

-- Replay the write the browser makes, as the learner, with RLS live
do $$
declare v_rows integer;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','<USER_UUID>','role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub','<USER_UUID>', true);
  set local role authenticated;
  update public.lesson_sessions set last_saved_at = now()
   where id = '<SESSION_UUID>' and status = 'active';
  get diagnostics v_rows = row_count;
  reset role;
  raise exception 'rows=%', v_rows;   -- aborts, so nothing is persisted
end $$;
```

Read the queued item in the browser console:

```js
JSON.parse(localStorage.getItem("aiko-pending-sync-v1") || "[]")
  .map(i => ({ key: i.dedupeKey, attempts: i.attempts, lastError: i.lastError }));
```

## Files

| Path | Role |
|---|---|
| `components/lesson/lesson-player.tsx` | `commitAndAdvance`, banner |
| `lib/sync/backend-sync.ts` | `persistPhaseCompletion`, `runPendingSync` |
| `lib/sync/offline-queue.ts` | durable queue in localStorage |
| `lib/repositories/lesson-session-repository.ts` | `startOrResume`, `saveCheckpoint`, `commitPhase` |
| `supabase/migrations/20260824064500_single_active_lesson_session.sql` | one open lesson |
| `supabase/tests/learn_single_active_session_behavior.sql` | pgTAP for the above |
