-- VIP Guard final clean schema.
-- Safe for a fresh Supabase project. Do not include real data or secrets here.

create extension if not exists pgcrypto;

do $$
begin
  create type public.subscription_status as enum (
    'pending',
    'active',
    'needs_manual_review',
    'expired',
    'cancelled'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.operational_status as enum (
    'unknown',
    'pending_validation',
    'payment_validated',
    'invite_not_sent',
    'invite_sent_pending_join',
    'invite_delivery_failed',
    'retry_pending',
    'bot_blocked',
    'active_in_group',
    'active_out_of_group',
    'expired_manual_review',
    'expulsion_pending',
    'expulsion_failed',
    'unban_failed',
    'expelled',
    'resolved_manual'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.expulsion_status as enum (
    'not_required',
    'pending',
    'failed',
    'unban_failed',
    'succeeded',
    'resolved_manual'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.log_level as enum (
    'info',
    'warning',
    'error'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.incident_status as enum (
    'open',
    'investigating',
    'acknowledged',
    'resolved',
    'ignored'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.incident_severity as enum (
    'info',
    'low',
    'medium',
    'warning',
    'high',
    'error',
    'critical'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.manual_payment_status as enum (
    'recorded',
    'applied',
    'cancelled'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.referral_reward_status as enum (
    'pending',
    'applied',
    'skipped'
  );
exception when duplicate_object then null;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique not null,
  telegram_username text,
  first_name text,
  last_name text,
  language_code text,
  first_seen_at timestamptz not null default now(),
  started_bot_at timestamptz,
  last_seen_at timestamptz,
  first_subscription_at timestamptz,
  current_streak_months integer not null default 0 check (current_streak_months >= 0),
  operational_status public.operational_status not null default 'unknown',
  internal_notes text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vip_groups (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint unique not null,
  name text not null,
  public_name text,
  is_active boolean not null default true,
  automatic_expulsion_enabled boolean not null default false,
  beta_mode boolean not null default true,
  read_only_mode boolean not null default false,
  admin_contact text,
  payment_instructions text,
  welcome_text text,
  renewal_text text,
  support_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id uuid not null references public.telegram_users(id) on delete cascade,
  vip_group_id uuid not null references public.vip_groups(id) on delete cascade,
  status public.subscription_status not null default 'pending',
  operational_status public.operational_status not null default 'unknown',
  starts_at timestamptz,
  ends_at timestamptz,
  activated_by text,
  source text not null default 'manual',
  warned_48h_at timestamptz,
  warned_72h_at timestamptz,
  warned_24h_at timestamptz,
  warned_1h_at timestamptz,
  expiration_detected_at timestamptz,
  expulsion_status public.expulsion_status not null default 'not_required',
  expulsion_attempts integer not null default 0 check (expulsion_attempts >= 0),
  last_expulsion_attempt_at timestamptz,
  last_expulsion_error text,
  expelled_at timestamptz,
  unbanned_after_kick_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_dates_order_check
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table if not exists public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id uuid not null references public.telegram_users(id) on delete cascade,
  vip_group_id uuid references public.vip_groups(id) on delete set null,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency char(3) not null default 'EUR',
  duration_days integer check (duration_days is null or duration_days > 0),
  duration_months integer check (duration_months is null or duration_months > 0),
  payment_method text,
  payment_reference text,
  notes text,
  created_by_admin text,
  status public.manual_payment_status not null default 'recorded',
  applied_subscription_id uuid references public.subscriptions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_payments_currency_upper_check check (currency = upper(currency))
);

create table if not exists public.invite_links (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id uuid not null references public.telegram_users(id) on delete cascade,
  vip_group_id uuid not null references public.vip_groups(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  invite_link text not null,
  expire_at timestamptz,
  member_limit integer not null default 1 check (member_limit > 0),
  sent_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  reused_from_id uuid references public.invite_links(id) on delete set null,
  created_by_action text,
  delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id uuid not null unique references public.telegram_users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint referral_codes_code_check check (code ~ '^[A-Za-z0-9_-]{6,32}$')
);

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.telegram_users(id) on delete cascade,
  referred_user_id uuid not null unique references public.telegram_users(id) on delete cascade,
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint referral_attributions_no_self_check check (referrer_user_id <> referred_user_id)
);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  attribution_id uuid not null unique references public.referral_attributions(id) on delete cascade,
  referrer_user_id uuid not null references public.telegram_users(id) on delete cascade,
  referred_user_id uuid not null references public.telegram_users(id) on delete cascade,
  rewarded_subscription_id uuid references public.subscriptions(id) on delete set null,
  reward_days integer not null default 5 check (reward_days > 0),
  status public.referral_reward_status not null default 'pending',
  applied_at timestamptz,
  skipped_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.bot_logs (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id uuid references public.telegram_users(id) on delete set null,
  vip_group_id uuid references public.vip_groups(id) on delete set null,
  action text not null,
  level public.log_level not null default 'info',
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_user_id uuid references public.telegram_users(id) on delete set null,
  message text,
  metadata jsonb,
  performed_by text not null default 'admin',
  created_at timestamptz not null default now()
);

create table if not exists public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id uuid references public.telegram_users(id) on delete set null,
  vip_group_id uuid references public.vip_groups(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  severity public.incident_severity not null default 'warning',
  status public.incident_status not null default 'open',
  code text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_jobs (
  job_name text primary key,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  last_duration_ms integer check (last_duration_ms is null or last_duration_ms >= 0),
  last_result_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token_hash text unique not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip_hash text
);

create table if not exists public.bot_health_checks (
  id uuid primary key default gen_random_uuid(),
  vip_group_id uuid references public.vip_groups(id) on delete set null,
  ok boolean not null default false,
  chat_id bigint,
  chat_title text,
  bot_inside boolean not null default false,
  bot_admin boolean not null default false,
  can_create_invite boolean not null default false,
  can_restrict_members boolean not null default false,
  can_read_events boolean not null default false,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id uuid not null references public.telegram_users(id) on delete cascade,
  vip_group_id uuid references public.vip_groups(id) on delete set null,
  type text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists telegram_users_updated_at on public.telegram_users;
create trigger telegram_users_updated_at
before update on public.telegram_users
for each row execute function public.set_updated_at();

drop trigger if exists vip_groups_updated_at on public.vip_groups;
create trigger vip_groups_updated_at
before update on public.vip_groups
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists manual_payments_updated_at on public.manual_payments;
create trigger manual_payments_updated_at
before update on public.manual_payments
for each row execute function public.set_updated_at();

drop trigger if exists invite_links_updated_at on public.invite_links;
create trigger invite_links_updated_at
before update on public.invite_links
for each row execute function public.set_updated_at();

drop trigger if exists operational_incidents_updated_at on public.operational_incidents;
create trigger operational_incidents_updated_at
before update on public.operational_incidents
for each row execute function public.set_updated_at();

drop trigger if exists system_jobs_updated_at on public.system_jobs;
create trigger system_jobs_updated_at
before update on public.system_jobs
for each row execute function public.set_updated_at();

drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

create index if not exists telegram_users_telegram_id_idx
  on public.telegram_users(telegram_user_id);

create index if not exists telegram_users_username_idx
  on public.telegram_users(lower(telegram_username))
  where telegram_username is not null;

create index if not exists telegram_users_first_subscription_idx
  on public.telegram_users(first_subscription_at);

create index if not exists subscriptions_status_ends_at_idx
  on public.subscriptions(status, ends_at);

create index if not exists subscriptions_user_idx
  on public.subscriptions(telegram_user_id);

create index if not exists subscriptions_user_created_idx
  on public.subscriptions(telegram_user_id, created_at desc);

create index if not exists subscriptions_group_idx
  on public.subscriptions(vip_group_id);

create index if not exists subscriptions_group_status_idx
  on public.subscriptions(vip_group_id, status, ends_at desc);

create index if not exists subscriptions_expulsion_status_idx
  on public.subscriptions(expulsion_status);

create index if not exists subscriptions_expulsion_retry_idx
  on public.subscriptions(status, expulsion_status, ends_at);

create index if not exists subscriptions_active_expiration_idx
  on public.subscriptions(ends_at)
  where status = 'active';

create index if not exists subscriptions_pending_expulsion_idx
  on public.subscriptions(last_expulsion_attempt_at, ends_at)
  where status = 'expired' and expulsion_status in ('pending', 'failed');

create unique index if not exists subscriptions_one_active_per_user_group_idx
  on public.subscriptions(telegram_user_id, vip_group_id)
  where status = 'active';

create index if not exists manual_payments_user_created_idx
  on public.manual_payments(telegram_user_id, created_at desc);

create index if not exists manual_payments_status_created_idx
  on public.manual_payments(status, created_at desc);

create index if not exists invite_links_user_group_expire_idx
  on public.invite_links(telegram_user_id, vip_group_id, expire_at desc);

create index if not exists invite_links_lookup_active_idx
  on public.invite_links(telegram_user_id, vip_group_id, revoked_at, used_at, expire_at desc);

create index if not exists invite_links_subscription_idx
  on public.invite_links(subscription_id);

create index if not exists referral_codes_user_idx
  on public.referral_codes(telegram_user_id);

create index if not exists referral_attributions_referrer_idx
  on public.referral_attributions(referrer_user_id, created_at desc);

create index if not exists referral_rewards_referrer_status_idx
  on public.referral_rewards(referrer_user_id, status, created_at desc);

create index if not exists bot_logs_created_idx
  on public.bot_logs(created_at desc);

create index if not exists bot_logs_action_created_idx
  on public.bot_logs(action, created_at desc);

create index if not exists bot_logs_user_created_idx
  on public.bot_logs(telegram_user_id, created_at desc);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs(created_at desc);

create index if not exists admin_audit_logs_target_created_idx
  on public.admin_audit_logs(target_user_id, created_at desc);

create index if not exists operational_incidents_status_severity_created_idx
  on public.operational_incidents(status, severity, created_at desc);

create index if not exists operational_incidents_user_created_idx
  on public.operational_incidents(telegram_user_id, created_at desc);

create index if not exists admin_sessions_expires_revoked_idx
  on public.admin_sessions(expires_at, revoked_at);

create index if not exists bot_health_checks_checked_idx
  on public.bot_health_checks(checked_at desc);

create index if not exists bot_health_checks_group_checked_idx
  on public.bot_health_checks(vip_group_id, checked_at desc);

create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages(type, scheduled_at)
  where sent_at is null and failed_at is null;

create index if not exists scheduled_messages_user_idx
  on public.scheduled_messages(telegram_user_id, created_at desc);

create or replace function public.admin_list_users(
  p_status text default 'all',
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_now timestamptz default now()
)
returns table (
  id uuid,
  telegram_user_id bigint,
  telegram_username text,
  first_name text,
  last_name text,
  language_code text,
  first_seen_at timestamptz,
  started_bot_at timestamptz,
  last_seen_at timestamptz,
  first_subscription_at timestamptz,
  operational_status public.operational_status,
  internal_notes text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  subscription jsonb,
  access_status text,
  total_count bigint
)
language sql
stable
as $$
  with users_with_latest as (
    select
      u.*,
      s.id as subscription_id,
      case
        when s.id is null or s.status = 'pending' then 'pending_validation'
        when s.status = 'needs_manual_review' then 'needs_manual_review'
        when s.status = 'active' and (s.ends_at is null or s.ends_at > p_now) then 'active'
        when s.status = 'active' and s.ends_at is not null and s.ends_at <= p_now then 'expired'
        when s.status = 'expired' then 'expired'
        when s.status = 'cancelled' then 'cancelled'
        else 'pending_validation'
      end as computed_access_status,
      case when s.id is null then null else to_jsonb(s) end as latest_subscription
    from public.telegram_users u
    left join lateral (
      select *
      from public.subscriptions s
      where s.telegram_user_id = u.id
      order by
        case
          when s.status = 'active' and (s.ends_at is null or s.ends_at > p_now) then 0
          when s.status = 'needs_manual_review' then 1
          when s.status = 'pending' then 2
          when s.status = 'expired' or (s.status = 'active' and s.ends_at is not null and s.ends_at <= p_now) then 3
          when s.status = 'cancelled' then 4
          else 5
        end,
        s.ends_at desc nulls last,
        s.created_at desc
      limit 1
    ) s on true
    where
      p_search is null
      or p_search = ''
      or u.telegram_username ilike '%' || p_search || '%'
      or u.first_name ilike '%' || p_search || '%'
      or u.last_name ilike '%' || p_search || '%'
      or (p_search ~ '^[0-9]+$' and u.telegram_user_id = p_search::bigint)
  ),
  filtered as (
    select *
    from users_with_latest
    where
      p_status = 'all'
      or computed_access_status = p_status
      or (p_status = 'pending_validation' and computed_access_status = 'needs_manual_review')
  ),
  counted as (
    select *, count(*) over() as total_count
    from filtered
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.id,
    counted.telegram_user_id,
    counted.telegram_username,
    counted.first_name,
    counted.last_name,
    counted.language_code,
    counted.first_seen_at,
    counted.started_bot_at,
    counted.last_seen_at,
    counted.first_subscription_at,
    counted.operational_status,
    counted.internal_notes,
    counted.tags,
    counted.created_at,
    counted.updated_at,
    counted.latest_subscription as subscription,
    counted.computed_access_status as access_status,
    counted.total_count
  from counted;
$$;

alter table public.telegram_users enable row level security;
alter table public.vip_groups enable row level security;
alter table public.subscriptions enable row level security;
alter table public.manual_payments enable row level security;
alter table public.invite_links enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.bot_logs enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.operational_incidents enable row level security;
alter table public.system_jobs enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.bot_health_checks enable row level security;
alter table public.scheduled_messages enable row level security;

-- Production security model:
-- anon/authenticated get no table policies and no table grants.
-- Server-only code uses SUPABASE_SERVICE_ROLE_KEY; Supabase service_role bypasses RLS.
revoke all on table public.telegram_users from anon, authenticated;
revoke all on table public.vip_groups from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.manual_payments from anon, authenticated;
revoke all on table public.invite_links from anon, authenticated;
revoke all on table public.referral_codes from anon, authenticated;
revoke all on table public.referral_attributions from anon, authenticated;
revoke all on table public.referral_rewards from anon, authenticated;
revoke all on table public.bot_logs from anon, authenticated;
revoke all on table public.admin_audit_logs from anon, authenticated;
revoke all on table public.operational_incidents from anon, authenticated;
revoke all on table public.system_jobs from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.admin_sessions from anon, authenticated;
revoke all on table public.bot_health_checks from anon, authenticated;
revoke all on table public.scheduled_messages from anon, authenticated;

grant usage on schema public to service_role;
revoke all on type public.subscription_status from public;
revoke all on type public.operational_status from public;
revoke all on type public.expulsion_status from public;
revoke all on type public.log_level from public;
revoke all on type public.incident_status from public;
revoke all on type public.incident_severity from public;
revoke all on type public.manual_payment_status from public;
revoke all on type public.referral_reward_status from public;
grant usage on type public.subscription_status to service_role;
grant usage on type public.operational_status to service_role;
grant usage on type public.expulsion_status to service_role;
grant usage on type public.log_level to service_role;
grant usage on type public.incident_status to service_role;
grant usage on type public.incident_severity to service_role;
grant usage on type public.manual_payment_status to service_role;
grant usage on type public.referral_reward_status to service_role;

grant select, insert, update, delete on table public.telegram_users to service_role;
grant select, insert, update, delete on table public.vip_groups to service_role;
grant select, insert, update, delete on table public.subscriptions to service_role;
grant select, insert, update, delete on table public.manual_payments to service_role;
grant select, insert, update, delete on table public.invite_links to service_role;
grant select, insert, update, delete on table public.referral_codes to service_role;
grant select, insert, update, delete on table public.referral_attributions to service_role;
grant select, insert, update, delete on table public.referral_rewards to service_role;
grant select, insert, update, delete on table public.bot_logs to service_role;
grant select, insert, update, delete on table public.admin_audit_logs to service_role;
grant select, insert, update, delete on table public.operational_incidents to service_role;
grant select, insert, update, delete on table public.system_jobs to service_role;
grant select, insert, update, delete on table public.app_settings to service_role;
grant select, insert, update, delete on table public.admin_sessions to service_role;
grant select, insert, update, delete on table public.bot_health_checks to service_role;
grant select, insert, update, delete on table public.scheduled_messages to service_role;
revoke all on function public.set_updated_at() from public;
revoke all on function public.admin_list_users(text, text, integer, integer, timestamptz) from public;
grant execute on function public.set_updated_at() to service_role;
grant execute on function public.admin_list_users(text, text, integer, integer, timestamptz) to service_role;

comment on table public.telegram_users is 'Telegram identities. Never trust username as identity; use telegram_user_id.';
comment on table public.vip_groups is 'VIP Telegram groups plus editable commercial/contact copy.';
comment on table public.subscriptions is 'Access state, expiration, warning and expulsion retry state.';
comment on table public.invite_links is 'Personal Telegram invite links. App logic reuses valid unrevoked links.';
comment on table public.referral_codes is 'Stable per-user referral codes for t.me/BOT?start=ref_CODE links.';
comment on table public.referral_attributions is 'One immutable referrer per referred user; self-referrals are blocked.';
comment on table public.referral_rewards is 'Idempotent referral rewards applied after referred user becomes active.';
comment on table public.manual_payments is 'Manual Bizum/transfer/payment records before future payment integrations.';
comment on table public.operational_incidents is 'Visible operational problems requiring admin action.';
comment on table public.system_jobs is 'Cron heartbeat and result summaries.';
comment on table public.app_settings is 'Global app/dashboard/PWA feature flags or settings.';
comment on table public.admin_sessions is 'Revocable admin sessions. Cookie stores signed id/token; database stores only token hash.';
comment on table public.bot_health_checks is 'Telegram bot/group operability checks for dashboard alerts.';
comment on table public.scheduled_messages is 'Minimal scheduled bot messages such as first-day onboarding; not a marketing campaign system.';
