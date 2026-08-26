# Custom lesson worker scheduler

Custom-topic generation uses a durable database job and an every-minute Supabase Cron wake-up. The migration `20260810100000_supabase_custom_lesson_scheduler.sql` enables `pg_cron`, `pg_net`, and Vault, then creates the stable `custom-lesson-worker-every-minute` job. Reapplying the scheduling block first removes jobs with that name, so it cannot accumulate duplicate schedules.

## Production configuration

The canonical AIko production origin is `https://aiko.zetbros.com`.

1. Generate one random secret with at least 16 characters. Set it as the server-only Vercel environment variable `CUSTOM_LESSON_WORKER_SECRET`.
2. Open **Supabase Dashboard → Database → Vault** and create these two secrets. Do not commit either value.

   - Name `custom_lesson_worker_url`: `https://aiko.zetbros.com/api/internal/custom-lessons/process`
   - Name `custom_lesson_worker_secret`: the exact value of the Vercel `CUSTOM_LESSON_WORKER_SECRET` environment variable.
3. Apply the database migrations, then redeploy the existing Vercel project. No Vercel Cron configuration is required.

Do not point the production Vault URL at a generated `*.vercel.app` deployment hostname. Keeping the worker on `aiko.zetbros.com` means deployment hostnames can change without breaking the scheduler.

To rotate either secret, find its ID and update it without changing its stable name:

```sql
select id, name, updated_at
from vault.decrypted_secrets
where name in ('custom_lesson_worker_url', 'custom_lesson_worker_secret');

select vault.update_secret('SECRET_ID', 'NEW_SECRET_VALUE');
```

## Readiness and troubleshooting

The generation endpoint checks scheduler readiness before it persists a new job. Missing Vault configuration or an inactive schedule returns `503` with code `CUSTOM_LESSON_SCHEDULER_UNAVAILABLE` instead of leaving a lesson silently queued. The same state is written to the existing `service_status` table under `Custom lesson scheduler`.

Set `CUSTOM_LESSON_WORKER_URL` in your shell to the same full endpoint stored in Vault, then run the protected HTTP diagnostic with the worker bearer token:

```bash
export CUSTOM_LESSON_WORKER_URL="https://aiko.zetbros.com/api/internal/custom-lessons/process"
curl -H "Authorization: Bearer $CUSTOM_LESSON_WORKER_SECRET" \
  "${CUSTOM_LESSON_WORKER_URL}?diagnostics=1"
```

Or inspect Supabase directly:

```sql
select public.custom_lesson_scheduler_diagnostics();

select jobid, jobname, schedule, active, command
from cron.job
where jobname = 'custom-lesson-worker-every-minute';

select status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid from cron.job
  where jobname = 'custom-lesson-worker-every-minute'
)
order by runid desc
limit 20;

select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 20;
```

The scheduler queues HTTP requests asynchronously with a 285-second timeout. The worker endpoint remains protected by exact bearer-token comparison, and database stage claims prevent overlapping minute invocations from processing the same job concurrently.
