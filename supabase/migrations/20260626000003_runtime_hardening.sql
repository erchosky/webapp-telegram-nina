-- FUSION hardening required before production.
-- Provides distributed rate limiting for serverless/API deployments.

create table if not exists public.rate_limit_buckets (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_reset_idx
  on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_ms integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_reset timestamptz := now() + make_interval(secs => greatest(p_window_ms, 1000) / 1000.0);
  v_count integer;
begin
  if p_key is null or length(trim(p_key)) = 0 or p_limit < 1 then
    return false;
  end if;

  -- Opportunistic cleanup keeps request latency predictable for MVP/serverless:
  -- each call repairs its own bucket, while only a small sample clears old rows.
  if random() < 0.02 then
    delete from public.rate_limit_buckets
    where reset_at < v_now - interval '10 minutes';
  end if;

  insert into public.rate_limit_buckets as b (key, count, reset_at, updated_at)
  values (p_key, 1, v_reset, v_now)
  on conflict (key) do update
    set count = case
          when b.reset_at <= v_now then 1
          else b.count + 1
        end,
        reset_at = case
          when b.reset_at <= v_now then v_reset
          else b.reset_at
        end,
        updated_at = v_now
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
revoke all on table public.rate_limit_buckets from anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_buckets to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

comment on table public.rate_limit_buckets is
  'Distributed API rate-limit counters. Required in production; development/test may use memory.';
comment on function public.check_rate_limit(text, integer, integer) is
  'Server-side fixed-window rate limit RPC. Requires service_role execute grant; app surfaces a clear 503 if missing.';

create table if not exists public.processed_telegram_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);

create index if not exists processed_telegram_updates_processed_at_idx
  on public.processed_telegram_updates (processed_at);

alter table public.processed_telegram_updates enable row level security;
revoke all on table public.processed_telegram_updates from anon, authenticated;
grant select, insert, update, delete on table public.processed_telegram_updates to service_role;

comment on table public.processed_telegram_updates is
  'Stores only Telegram update_id values for webhook retry deduplication. No raw update payload is persisted.';
