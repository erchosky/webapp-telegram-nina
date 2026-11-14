-- ─────────────────────────────────────────────────────────────────────────────
-- VIP Guard Mini App — additive migration: payment_intents
--
-- PURPOSE
--   Lets a VIP user signal from the Mini App "I've paid / I want to renew" so the
--   admin can review and confirm the payment MANUALLY (same manual flow as the
--   rest of VIP Guard). This is intentionally SEPARATE from `manual_payments`,
--   which represents payments the ADMIN has already recorded — we must not write
--   admin-owned rows from an end-user surface.
--
-- INTEGRATION
--   Purely additive. Runs after `supabase/001_core_schema.sql`:
--   it only CREATEs a new enum, table, indexes and trigger; it never alters or
--   drops anything that already exists. RLS stays closed (service_role only),
--   consistent with the rest of VIP Guard.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Status enum (idempotent create).
do $$
begin
  create type public.payment_intent_status as enum
    ('requested', 'seen', 'resolved', 'cancelled');
exception
  when duplicate_object then null;
end
$$;

-- 2) Table.
create table if not exists public.payment_intents (
  id              uuid primary key default gen_random_uuid(),
  telegram_user_id uuid not null
    references public.telegram_users (id) on delete cascade,
  vip_group_id    uuid
    references public.vip_groups (id) on delete set null,
  subscription_id uuid
    references public.subscriptions (id) on delete set null,
  status          public.payment_intent_status not null default 'requested',
  source          text not null default 'miniapp',
  user_note       text,
  note            text,
  admin_note      text,
  selected_plan_id text,
  amount_expected numeric(12, 2),
  currency        text,
  payment_method  text,
  seen_at         timestamptz,
  resolved_at     timestamptz,
  resolved_by     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint payment_intents_source_check
    check (source in ('miniapp', 'vip_guard_admin')),
  constraint payment_intents_amount_expected_check
    check (amount_expected is null or amount_expected >= 0),
  constraint payment_intents_currency_check
    check (currency is null or (currency = upper(currency) and currency ~ '^[A-Z]{3}$'))
);

-- Additive compatibility if an earlier Mini App migration already created the
-- table with the smaller contract.
alter table public.payment_intents
  add column if not exists user_note text,
  add column if not exists admin_note text,
  add column if not exists selected_plan_id text,
  add column if not exists amount_expected numeric(12, 2),
  add column if not exists currency text,
  add column if not exists payment_method text,
  add column if not exists seen_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payment_intents_source_check'
  ) then
    alter table public.payment_intents
      add constraint payment_intents_source_check
      check (source in ('miniapp', 'vip_guard_admin'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_intents_amount_expected_check'
  ) then
    alter table public.payment_intents
      add constraint payment_intents_amount_expected_check
      check (amount_expected is null or amount_expected >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'payment_intents_currency_check'
  ) then
    alter table public.payment_intents
      add constraint payment_intents_currency_check
      check (currency is null or (currency = upper(currency) and currency ~ '^[A-Z]{3}$'));
  end if;
end
$$;

-- 3) Indexes for the admin queue and per-user lookups.
create index if not exists payment_intents_user_idx
  on public.payment_intents (telegram_user_id);
create index if not exists payment_intents_status_idx
  on public.payment_intents (status);
create index if not exists payment_intents_admin_queue_idx
  on public.payment_intents (status, created_at)
  where status in ('requested', 'seen');

-- At most one OPEN intent (requested/seen) per user, to keep the manual queue
-- clean and make the Mini App's "register intent" action naturally idempotent.
create unique index if not exists payment_intents_one_open_per_user
  on public.payment_intents (telegram_user_id)
  where status in ('requested', 'seen');

-- 4) Keep updated_at fresh. Requires public.set_updated_at() from
--    001_core_schema.sql.

drop trigger if exists payment_intents_set_updated_at on public.payment_intents;
create trigger payment_intents_set_updated_at
  before update on public.payment_intents
  for each row execute function public.set_updated_at();

-- 5) RLS closed: no anon/authenticated policies. Only service_role (which
--    bypasses RLS) may read/write, exactly like the rest of VIP Guard.
alter table public.payment_intents enable row level security;
revoke all on table public.payment_intents from anon, authenticated;
revoke all on type public.payment_intent_status from public;
grant usage on type public.payment_intent_status to service_role;
grant select, insert, update, delete on table public.payment_intents to service_role;

comment on table public.payment_intents is
  'User-side Mini App payment/renewal requests. Admin/VIP Guard resolves manually.';
comment on column public.payment_intents.user_note is
  'Optional note from the Mini App user. The current UI leaves this null.';
comment on column public.payment_intents.admin_note is
  'Internal admin note for VIP Guard. Never expose this to Mini App users.';
comment on column public.payment_intents.selected_plan_id is
  'Optional Mini App plan identifier selected by the user before sending the manual payment notice.';
comment on column public.payment_intents.resolved_by is
  'VIP Guard admin identifier/name that resolved the request.';
