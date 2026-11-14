begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
  26,
  'all application tables are present'
);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  26,
  'RLS is enabled on every public table'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public'),
  0,
  'the closed model defines no public table policies'
);

select ok(
  (select bool_and(not has_table_privilege('anon', format('%I.%I', schemaname, tablename), 'SELECT,INSERT,UPDATE,DELETE')) from pg_tables where schemaname = 'public'),
  'anon has no direct CRUD privileges'
);

select ok(
  (select bool_and(not has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'SELECT,INSERT,UPDATE,DELETE')) from pg_tables where schemaname = 'public'),
  'authenticated has no direct CRUD privileges'
);

select ok(
  (select bool_and(has_table_privilege('service_role', format('%I.%I', schemaname, tablename), 'SELECT,INSERT,UPDATE,DELETE')) from pg_tables where schemaname = 'public'),
  'service_role has explicit CRUD privileges'
);

select ok(
  not has_function_privilege('anon', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE'),
  'rate-limit RPC is private'
);

select ok(
  not has_function_privilege('anon', 'public.admin_list_users(text,text,integer,integer,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.admin_list_users(text,text,integer,integer,timestamptz)', 'EXECUTE'),
  'admin users RPC is private'
);

select throws_ok(
  'set local role anon; select * from public.telegram_users limit 1',
  '42501',
  null,
  'anon cannot query a private table'
);

select throws_ok(
  'set local role authenticated; update public.telegram_users set first_name = ''forged'' where id = ''10000000-0000-4000-8000-000000000001''',
  '42501',
  null,
  'authenticated cannot modify a private row'
);

select * from finish();
rollback;
