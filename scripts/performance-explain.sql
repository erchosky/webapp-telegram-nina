\set ON_ERROR_STOP on
\pset pager off
\timing on

begin;

insert into public.telegram_users (
  id, telegram_user_id, telegram_username, first_name, created_at, updated_at
)
select
  ('90000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
  800000000 + gs,
  'perf_user_' || gs,
  'Performance ' || gs,
  now() - (gs % 365 || ' days')::interval,
  now()
from generate_series(1, 5000) as gs
on conflict do nothing;

insert into public.subscriptions (
  id, telegram_user_id, vip_group_id, status, starts_at, ends_at,
  source, expulsion_status, created_at, updated_at
)
select
  ('91000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
  ('90000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  (case when gs % 5 = 0 then 'expired' else 'active' end)::public.subscription_status,
  now() - interval '30 days',
  now() + ((gs % 90) - 20 || ' days')::interval,
  'performance_fixture',
  (case when gs % 5 = 0 then 'pending' else 'not_required' end)::public.expulsion_status,
  now() - (gs % 365 || ' days')::interval,
  now()
from generate_series(1, 5000) as gs
on conflict do nothing;

insert into public.marketplace_items (
  id, creator_id, category_id, status, title, description, public_visible,
  is_featured, sort_order, kind, delivery_type, requires_active_access,
  cta_label, contact_intent, published_at
)
select
  ('92000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
  '50000000-0000-4000-8000-000000000001'::uuid,
  '60000000-0000-4000-8000-000000000001'::uuid,
  case when gs % 10 = 0 then 'hidden' else 'available' end,
  'Performance item ' || gs,
  'Synthetic performance fixture',
  gs % 10 <> 0,
  gs % 20 = 0,
  gs,
  'online_content',
  'telegram',
  false,
  'Me interesa',
  'performance fixture',
  now()
from generate_series(1, 2000) as gs
on conflict do nothing;

insert into public.purchase_interests (
  id, creator_id, item_id, telegram_user_id, telegram_user_numeric_id,
  message, status, metadata, created_at
)
select
  ('93000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
  '50000000-0000-4000-8000-000000000001'::uuid,
  ('92000000-0000-4000-8000-' || lpad((((gs - 1) % 2000) + 1)::text, 12, '0'))::uuid,
  ('90000000-0000-4000-8000-' || lpad((((gs - 1) % 5000) + 1)::text, 12, '0'))::uuid,
  800000000 + (((gs - 1) % 5000) + 1),
  'Synthetic interest',
  case when gs % 3 = 0 then 'resolved' else 'requested' end,
  '{"source":"performance_fixture"}'::jsonb,
  now() - (gs % 90 || ' days')::interval
from generate_series(1, 10000) as gs
on conflict do nothing;

insert into public.admin_audit_logs (action, message, performed_by, created_at)
select 'performance_fixture', 'Synthetic audit event ' || gs, 'fixture', now() - (gs % 90 || ' days')::interval
from generate_series(1, 10000) as gs;

analyze public.telegram_users;
analyze public.subscriptions;
analyze public.marketplace_items;
analyze public.purchase_interests;
analyze public.admin_audit_logs;
analyze public.processed_telegram_updates;

\echo '=== catalog ==='
explain (analyze, buffers)
select id, category_id, status, title, public_visible, is_featured, sort_order
from public.marketplace_items
where status <> 'hidden' and status <> 'archived' and public_visible = true
order by is_featured desc, sort_order asc
limit 200;

\echo '=== telegram_identity ==='
explain (analyze, buffers)
select id, telegram_user_id, telegram_username
from public.telegram_users
where telegram_user_id = 800004321;

\echo '=== admin_session ==='
explain (analyze, buffers)
select id, session_token_hash, expires_at, revoked_at
from public.admin_sessions
where id = '40000000-0000-4000-8000-000000000001';

\echo '=== current_membership ==='
explain (analyze, buffers)
select * from public.subscriptions
where telegram_user_id = '90000000-0000-4000-8000-000000004321'::uuid
order by created_at desc
limit 100;

\echo '=== open_interest ==='
explain (analyze, buffers)
select id, status, created_at
from public.purchase_interests
where telegram_user_id = '90000000-0000-4000-8000-000000004321'::uuid
  and item_id = '92000000-0000-4000-8000-000000004321'::uuid
  and status in ('requested', 'seen', 'in_review')
order by created_at desc
limit 1;

\echo '=== expiration_cron ==='
explain (analyze, buffers)
select id, telegram_user_id, vip_group_id, ends_at
from public.subscriptions
where status = 'active' and ends_at <= now()
order by ends_at asc
limit 501;

\echo '=== admin_export ==='
explain (analyze, buffers)
select id, first_name, telegram_username, telegram_user_id, first_subscription_at, internal_notes, tags
from public.telegram_users
order by created_at desc;

\echo '=== webhook_deduplication ==='
explain (analyze, buffers)
select update_id, processed_at
from public.processed_telegram_updates
where update_id = 900001;

rollback;
