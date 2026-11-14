begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

select throws_ok(
  $$insert into public.processed_telegram_updates (update_id) values (900001)$$,
  '23505',
  null,
  'a Telegram update_id can only be claimed once'
);

select throws_ok(
  $$insert into public.payment_intents (telegram_user_id, status, source) values ('10000000-0000-4000-8000-000000000002', 'requested', 'miniapp')$$,
  '23505',
  null,
  'a user can have at most one open payment intent'
);

select throws_ok(
  $$insert into public.purchase_interests (item_id, telegram_user_id, telegram_user_numeric_id, status) values ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 700000001, 'seen')$$,
  '23505',
  null,
  'a user can have at most one open interest per item'
);

select throws_ok(
  $$insert into public.subscriptions (telegram_user_id, vip_group_id, status) values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'active')$$,
  '23505',
  null,
  'a user can have at most one active subscription per group'
);

select results_eq(
  $$select count(*)::bigint from public.marketplace_items where status <> 'hidden' and status <> 'archived' and public_visible = true$$,
  array[1::bigint],
  'only one fixture item is eligible for the public catalog'
);

select * from finish();
rollback;
