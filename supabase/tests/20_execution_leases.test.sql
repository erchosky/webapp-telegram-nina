begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

delete from public.processed_telegram_updates where update_id in (990000101, 990000102);
delete from public.system_jobs where job_name = 'pgtap-execution-lock';

create temporary table telegram_claim_one on commit drop as
select * from public.claim_telegram_update(990000101, 120);

select ok(
  (select acquired and lease_token is not null from telegram_claim_one),
  'the first worker acquires a Telegram update lease'
);

select ok(
  (select not acquired and not already_processed and in_progress from public.claim_telegram_update(990000101, 120)),
  'a concurrent Telegram worker sees the active lease without acquiring it'
);

select is(
  public.release_telegram_update(990000101, gen_random_uuid()),
  false,
  'a different Telegram worker cannot release the lease'
);

select is(
  public.release_telegram_update(990000101, (select lease_token from telegram_claim_one)),
  true,
  'the owner can release a failed Telegram update for retry'
);

create temporary table telegram_claim_retry on commit drop as
select * from public.claim_telegram_update(990000101, 120);

select ok(
  (select acquired and lease_token is not null from telegram_claim_retry),
  'a released Telegram update can be reclaimed'
);

select is(
  public.complete_telegram_update(990000101, (select lease_token from telegram_claim_retry)),
  true,
  'the owning worker completes the Telegram update'
);

select is(
  public.complete_telegram_update(990000101, (select lease_token from telegram_claim_retry)),
  true,
  'completion is idempotent for the same lease token'
);

select ok(
  (select not acquired and already_processed and not in_progress from public.claim_telegram_update(990000101, 120)),
  'a completed Telegram update remains a permanent duplicate'
);

select ok(
  (select processed_at is not null and lease_expires_at is null from public.processed_telegram_updates where update_id = 990000101),
  'completion leaves a valid processed state without an active lease'
);

create temporary table telegram_expired_claim on commit drop as
select * from public.claim_telegram_update(990000102, 120);

update public.processed_telegram_updates
set lease_expires_at = clock_timestamp() - interval '1 second'
where update_id = 990000102;

create temporary table telegram_reclaimed_expired on commit drop as
select * from public.claim_telegram_update(990000102, 120);

select ok(
  (select acquired from telegram_reclaimed_expired),
  'an expired Telegram lease can be reclaimed after a crashed worker'
);

select isnt(
  (select lease_token from telegram_expired_claim),
  (select lease_token from telegram_reclaimed_expired),
  'reclaiming an expired Telegram lease rotates its token'
);

create temporary table cron_lock_one on commit drop as
select * from public.claim_system_job_lock('pgtap-execution-lock', 120);

select ok(
  (select acquired and lease_token is not null from cron_lock_one),
  'the first cron worker acquires the singleton lock'
);

select ok(
  (select not acquired and lease_token is null from public.claim_system_job_lock('pgtap-execution-lock', 120)),
  'a concurrent cron worker cannot acquire the active lock'
);

select is(
  public.release_system_job_lock('pgtap-execution-lock', gen_random_uuid()),
  false,
  'a different cron worker cannot release the lock'
);

select is(
  public.release_system_job_lock('pgtap-execution-lock', (select lease_token from cron_lock_one)),
  true,
  'the cron lock owner can release it'
);

create temporary table cron_lock_retry on commit drop as
select * from public.claim_system_job_lock('pgtap-execution-lock', 120);

select ok(
  (select acquired and lease_token is not null from cron_lock_retry),
  'a later cron execution can acquire the released lock'
);

select is(
  public.release_system_job_lock('pgtap-execution-lock', (select lease_token from cron_lock_retry)),
  true,
  'the later cron owner releases only its own lock'
);

select ok(
  not has_function_privilege('anon', 'public.claim_telegram_update(bigint,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_telegram_update(bigint,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.claim_system_job_lock(text,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_system_job_lock(text,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.claim_telegram_update(bigint,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.complete_telegram_update(bigint,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.release_telegram_update(bigint,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.claim_system_job_lock(text,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.release_system_job_lock(text,uuid)', 'EXECUTE'),
  'all execution lease RPCs remain private to service_role'
);

select * from finish();
rollback;
