# Database Migrations

Esta carpeta contiene migraciones SQL para una base Supabase limpia o para
reforzar una instalacion existente del proyecto. Todas las tablas viven en
`public`, con RLS activado y sin grants directos a `anon` ni `authenticated`.
El acceso de la aplicacion debe pasar por rutas server-side usando
`SUPABASE_SERVICE_ROLE_KEY`.

## Orden De Ejecucion

Ejecuta siempre los SQL en este orden:

1. `supabase/migrations/20260626000001_core_schema.sql`
2. `supabase/migrations/20260626000002_payment_intents.sql`
3. `supabase/migrations/20260626000003_runtime_hardening.sql`
4. `supabase/migrations/20260626000004_webapp_marketplace.sql`
5. `supabase/migrations/20260626000005_seed_or_config.sql`
6. `supabase/migrations/20260710000006_execution_leases.sql`
7. `supabase/migrations/20260711000007_marketplace_functional_integrity.sql`
8. `supabase/migrations/20260711000008_admin_media_usability.sql`

`scripts/apply-supabase-migrations.sh` aplica `supabase/migrations/*.sql` en orden
lexicografico, que coincide con la lista anterior.

## Que Hace Cada SQL

`001_core_schema.sql`

- Crea extension `pgcrypto`, tipos enum, tablas core de VIP Guard, indices,
  triggers `updated_at`, funcion `admin_list_users`, RLS, revokes y grants.
- Es seguro re-ejecutarlo para una instalacion ya alineada: usa guards en tipos,
  `create table if not exists`, `create index if not exists`, `drop trigger if
  exists` antes de recrear triggers, y `create or replace function`.
- No migra esquemas antiguos ni borra datos.

`002_payment_intents.sql`

- Crea la cola opcional `payment_intents` para avisos manuales desde MiniApp.
- Es aditivo e idempotente: usa `create table if not exists`, `add column if not
  exists`, constraints protegidas por bloques `do $$`, indices idempotentes y
  trigger recreable.
- No activa pagos automaticos ni concede acceso.

`003_runtime_hardening.sql`

- Crea `rate_limit_buckets`, RPC `check_rate_limit(text, integer, integer)` y
  tabla `processed_telegram_updates`.
- Activa RLS, revoca acceso directo a `anon`/`authenticated`, concede permisos a
  `service_role`, y revoca `EXECUTE` publico del RPC.
- Es seguro re-ejecutarlo; `create or replace function` actualiza el RPC sin
  borrar buckets ni update ids.

`004_webapp_marketplace.sql`

- Crea tablas canonicas del CMS/WebApp: `creators`, `webapp_settings`,
  `vip_plans`, `marketplace_categories`, `marketplace_items`,
  `marketplace_item_images` y `purchase_interests`.
- Crea indices, constraints, RLS, revokes/grants y triggers `updated_at`.
- Es idempotente para instalaciones alineadas.

`005_seed_or_config.sql`

- Inserta configuracion bootstrap segura para `webapp_settings` y categorias
  iniciales ocultas.
- Es re-ejecutable, pero actualiza valores bootstrap de settings por `key`.
  No guarda secretos ni datos reales.

## Pasos Manuales En Supabase

1. Usa un proyecto Supabase separado para staging.
2. Aplica los SQL en orden desde el SQL editor o con:

```bash
DATABASE_URL="postgresql://postgres:password@db.project-ref.supabase.co:5432/postgres" \
  scripts/apply-supabase-migrations.sh
```

3. Si un SQL falla, detente y no ejecutes los siguientes hasta resolverlo.
4. Configura secretos fuera de SQL: `SUPABASE_SERVICE_ROLE_KEY`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`,
   `ADMIN_PASSWORD` y `SESSION_SECRET`.
5. Mantén `NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=false` hasta crear bandeja admin de
   resolucion.

## Verificacion Rapida

Tablas esperadas:

```sql
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;
```

RLS en todas las tablas del proyecto:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'admin_audit_logs',
    'admin_sessions',
    'app_settings',
    'bot_health_checks',
    'bot_logs',
    'creators',
    'invite_links',
    'manual_payments',
    'marketplace_categories',
    'marketplace_item_images',
    'marketplace_items',
    'operational_incidents',
    'payment_intents',
    'processed_telegram_updates',
    'purchase_interests',
    'rate_limit_buckets',
    'referral_attributions',
    'referral_codes',
    'referral_rewards',
    'scheduled_messages',
    'subscriptions',
    'system_jobs',
    'telegram_users',
    'vip_groups',
    'vip_plans',
    'webapp_settings'
  )
order by tablename;
```

Resultado esperado: `rowsecurity = true` para todas.

Grants directos a roles publicos:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

Resultado esperado: 0 filas para tablas del proyecto.

RPC de rate limit:

```sql
select public.check_rate_limit('manual-smoke-test', 3, 60000) as allowed;
```

Resultado esperado: `true` en las primeras llamadas.

Funciones clave:

```sql
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('admin_list_users', 'check_rate_limit', 'set_updated_at')
order by proname;
```

Triggers duplicados:

```sql
select tgrelid::regclass as table_name, tgname, count(*)
from pg_trigger
where not tgisinternal
group by tgrelid::regclass, tgname
having count(*) > 1;
```

Resultado esperado: 0 filas.

## Riesgos De Reejecucion

- `005_seed_or_config.sql` actualiza settings bootstrap por `key`; si ya los
  personalizaste en dashboard, revisa antes de reejecutarlo en produccion.
- Las migraciones no hacen `drop table`, no eliminan columnas y no borran datos.
- Los `create table if not exists` no comparan estructura completa de una tabla
  ya existente creada manualmente; si una tabla existe con columnas distintas,
  revisa la deriva antes de seguir.
