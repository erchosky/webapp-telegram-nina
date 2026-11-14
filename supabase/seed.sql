-- Deterministic, synthetic fixtures for local integration only.
-- UUIDs and Telegram IDs are reserved test values and contain no personal data.

insert into public.telegram_users (
  id, telegram_user_id, telegram_username, first_name, language_code,
  started_bot_at, last_seen_at, operational_status, tags
) values
  ('10000000-0000-4000-8000-000000000001', 700000001, 'fixture_alba', 'Alba Fixture', 'es', now(), now(), 'active_in_group', array['fixture']),
  ('10000000-0000-4000-8000-000000000002', 700000002, 'fixture_beto', 'Beto Fixture', 'es', now(), now(), 'pending_validation', array['fixture']),
  ('10000000-0000-4000-8000-000000000003', 700000003, 'fixture_blocked', 'Blocked Fixture', 'en', now(), now(), 'bot_blocked', array['fixture','suspended'])
on conflict (id) do nothing;

insert into public.vip_groups (
  id, telegram_chat_id, name, public_name, is_active,
  automatic_expulsion_enabled, beta_mode, read_only_mode, admin_contact,
  payment_instructions, welcome_text, renewal_text, support_text
) values (
  '20000000-0000-4000-8000-000000000001', -100700000001,
  'Fixture VIP', 'Fixture VIP', true, false, true, false,
  '@fixture_admin', 'Pago de prueba sin dinero real.',
  'Bienvenida de integración.', 'Renovación de integración.', 'Soporte de integración.'
)
on conflict (id) do nothing;

insert into public.subscriptions (
  id, telegram_user_id, vip_group_id, status, operational_status,
  starts_at, ends_at, activated_by, source, expulsion_status
) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'active', 'active_in_group', now() - interval '7 days', now() + interval '30 days', 'fixture', 'integration', 'not_required'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'pending', 'pending_validation', null, null, null, 'integration', 'not_required'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'cancelled', 'bot_blocked', now() - interval '60 days', now() - interval '30 days', 'fixture', 'integration', 'not_required')
on conflict (id) do nothing;

insert into public.admin_sessions (
  id, session_token_hash, expires_at, user_agent, ip_hash
) values (
  '40000000-0000-4000-8000-000000000001',
  encode(digest('fixture-admin-session-token', 'sha256'), 'hex'),
  now() + interval '12 hours', 'integration-fixture',
  encode(digest('127.0.0.1', 'sha256'), 'hex')
)
on conflict (id) do nothing;

insert into public.creators (id, display_name, telegram_username, is_active)
values ('50000000-0000-4000-8000-000000000001', 'Fixture Creator', 'fixture_creator', true)
on conflict (id) do nothing;

insert into public.marketplace_categories (
  id, creator_id, slug, title, description, status, sort_order
) values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'fixture-public', 'Fixture publicada', 'Categoría visible de integración.', 'published', 1),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'fixture-hidden', 'Fixture oculta', 'Categoría no publicada.', 'hidden', 2)
on conflict (id) do nothing;

insert into public.marketplace_items (
  id, creator_id, category_id, status, title, description, price, currency,
  public_visible, is_featured, sort_order, kind, delivery_type,
  requires_active_access, cta_label, contact_intent, published_at
) values
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'available', 'Producto público fixture', 'Visible para integración.', 12.00, 'EUR', true, true, 1, 'online_content', 'telegram', false, 'Me interesa', 'fixture público', now()),
  ('70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', 'hidden', 'Producto oculto fixture', 'No debe aparecer.', 99.00, 'EUR', false, false, 2, 'physical_piece', 'manual', true, 'Oculto', 'fixture oculto', null)
on conflict (id) do nothing;

insert into public.vip_plans (
  id, creator_id, name, description, status, amount, currency,
  duration_days, is_featured, sort_order
) values
  ('71000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Plan fixture', 'Plan visible de integración.', 'published', 15.00, 'EUR', 30, true, 1),
  ('71000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'Plan oculto fixture', 'No visible.', 'hidden', 50.00, 'EUR', 90, false, 2)
on conflict (id) do nothing;

insert into public.purchase_interests (
  id, creator_id, item_id, telegram_user_id, telegram_user_numeric_id,
  user_name, telegram_username, message, status, metadata
) values
  ('80000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 700000001, 'Alba Fixture', 'fixture_alba', 'Interés A', 'requested', '{"source":"fixture"}'),
  ('80000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 700000002, 'Beto Fixture', 'fixture_beto', 'Interés B', 'resolved', '{"source":"fixture"}')
on conflict (id) do nothing;

insert into public.payment_intents (
  id, telegram_user_id, vip_group_id, subscription_id, status,
  source, selected_plan_id, amount_expected, currency
) values (
  '81000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  'requested', 'miniapp', '71000000-0000-4000-8000-000000000001', 15.00, 'EUR'
)
on conflict (id) do nothing;

insert into public.referral_codes (id, telegram_user_id, code)
values ('82000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'FIXTURE1')
on conflict (id) do nothing;

insert into public.processed_telegram_updates (update_id)
values (900001)
on conflict (update_id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('creator-assets', 'creator-assets', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('private-test-assets', 'private-test-assets', false, 1048576, array['text/plain'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
