-- Atomic execution leases for Telegram webhook updates and singleton jobs.
-- Leases prevent concurrent workers from performing the same external effects.

alter table public.processed_telegram_updates
  alter column processed_at drop not null,
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'processed_telegram_updates_execution_state_check'
      and conrelid = 'public.processed_telegram_updates'::regclass
  ) then
    alter table public.processed_telegram_updates
      add constraint processed_telegram_updates_execution_state_check
      check (
        (processed_at is not null and lease_expires_at is null)
        or (
          processed_at is null
          and claim_token is not null
          and claimed_at is not null
          and lease_expires_at is not null
        )
      );
  end if;
end
$$;

create index if not exists processed_telegram_updates_open_lease_idx
  on public.processed_telegram_updates (lease_expires_at)
  where processed_at is null;

create or replace function public.claim_telegram_update(
  p_update_id bigint,
  p_lease_seconds integer default 120
)
returns table (
  acquired boolean,
  already_processed boolean,
  in_progress boolean,
  lease_token uuid,
  lease_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
  v_lease_until timestamptz;
begin
  if p_update_id is null or p_update_id < 0 then
    raise exception 'p_update_id must be a non-negative bigint' using errcode = '22023';
  end if;

  v_lease_until := v_now + make_interval(
    secs => greatest(15, least(coalesce(p_lease_seconds, 120), 900))
  );

  return query
  insert into public.processed_telegram_updates as claimed (
    update_id,
    processed_at,
    claim_token,
    claimed_at,
    lease_expires_at,
    attempt_count
  )
  values (p_update_id, null, v_token, v_now, v_lease_until, 1)
  on conflict (update_id) do update
    set claim_token = excluded.claim_token,
        claimed_at = excluded.claimed_at,
        lease_expires_at = excluded.lease_expires_at,
        attempt_count = claimed.attempt_count + 1
    where claimed.processed_at is null
      and claimed.lease_expires_at <= v_now
  returning true, false, false, claimed.claim_token, claimed.lease_expires_at;

  if found then
    return;
  end if;

  return query
  select
    false,
    existing.processed_at is not null,
    existing.processed_at is null,
    null::uuid,
    existing.lease_expires_at
  from public.processed_telegram_updates as existing
  where existing.update_id = p_update_id;
end;
$$;

create or replace function public.complete_telegram_update(
  p_update_id bigint,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed boolean;
begin
  if p_update_id is null or p_lease_token is null then
    return false;
  end if;

  update public.processed_telegram_updates
  set processed_at = clock_timestamp(),
      lease_expires_at = null
  where update_id = p_update_id
    and claim_token = p_lease_token
    and processed_at is null
  returning true into v_completed;

  if found then
    return true;
  end if;

  -- Idempotent when the caller retries after the first completion committed.
  return exists (
    select 1
    from public.processed_telegram_updates
    where update_id = p_update_id
      and claim_token = p_lease_token
      and processed_at is not null
  );
end;
$$;

create or replace function public.release_telegram_update(
  p_update_id bigint,
  p_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with released as (
    delete from public.processed_telegram_updates
    where update_id = p_update_id
      and claim_token = p_lease_token
      and processed_at is null
    returning 1
  )
  select exists(select 1 from released);
$$;

alter table public.system_jobs
  add column if not exists lock_token uuid,
  add column if not exists lock_acquired_at timestamptz,
  add column if not exists lock_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'system_jobs_lock_state_check'
      and conrelid = 'public.system_jobs'::regclass
  ) then
    alter table public.system_jobs
      add constraint system_jobs_lock_state_check
      check (
        (lock_token is null and lock_acquired_at is null and lock_expires_at is null)
        or (lock_token is not null and lock_acquired_at is not null and lock_expires_at is not null)
      );
  end if;
end
$$;

create or replace function public.claim_system_job_lock(
  p_job_name text,
  p_lease_seconds integer default 120
)
returns table (
  acquired boolean,
  lease_token uuid,
  lease_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
  v_lease_until timestamptz;
begin
  if p_job_name is null or length(trim(p_job_name)) = 0 then
    raise exception 'p_job_name must not be blank' using errcode = '22023';
  end if;

  v_lease_until := v_now + make_interval(
    secs => greatest(15, least(coalesce(p_lease_seconds, 120), 900))
  );

  return query
  insert into public.system_jobs as job (
    job_name,
    lock_token,
    lock_acquired_at,
    lock_expires_at
  )
  values (p_job_name, v_token, v_now, v_lease_until)
  on conflict (job_name) do update
    set lock_token = excluded.lock_token,
        lock_acquired_at = excluded.lock_acquired_at,
        lock_expires_at = excluded.lock_expires_at
    where job.lock_expires_at is null
      or job.lock_expires_at <= v_now
  returning true, job.lock_token, job.lock_expires_at;

  if found then
    return;
  end if;

  return query
  select false, null::uuid, existing.lock_expires_at
  from public.system_jobs as existing
  where existing.job_name = p_job_name;
end;
$$;

create or replace function public.release_system_job_lock(
  p_job_name text,
  p_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with released as (
    update public.system_jobs
    set lock_token = null,
        lock_acquired_at = null,
        lock_expires_at = null
    where job_name = p_job_name
      and lock_token = p_lease_token
    returning 1
  )
  select exists(select 1 from released);
$$;

revoke all on function public.claim_telegram_update(bigint, integer) from public;
revoke all on function public.complete_telegram_update(bigint, uuid) from public;
revoke all on function public.release_telegram_update(bigint, uuid) from public;
revoke all on function public.claim_system_job_lock(text, integer) from public;
revoke all on function public.release_system_job_lock(text, uuid) from public;

grant execute on function public.claim_telegram_update(bigint, integer) to service_role;
grant execute on function public.complete_telegram_update(bigint, uuid) to service_role;
grant execute on function public.release_telegram_update(bigint, uuid) to service_role;
grant execute on function public.claim_system_job_lock(text, integer) to service_role;
grant execute on function public.release_system_job_lock(text, uuid) to service_role;

comment on function public.claim_telegram_update(bigint, integer) is
  'Atomically claims a Telegram update for one worker. Completed updates remain permanently deduplicated; expired leases may be reclaimed.';
comment on function public.claim_system_job_lock(text, integer) is
  'Atomically acquires a renewable-by-expiry singleton lease for a named server job.';
