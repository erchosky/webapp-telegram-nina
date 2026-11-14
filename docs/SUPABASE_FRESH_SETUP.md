# Supabase Fresh Setup

Esta guia es para una base limpia de staging. No mezcles staging con produccion:
usa un proyecto Supabase separado y prueba todo el flujo E2E antes de copiar
variables a produccion.

## Orden Exacto De SQL

Aplica siempre este orden:

1. `supabase/migrations/20260626000001_core_schema.sql`
2. `supabase/migrations/20260626000002_payment_intents.sql`
3. `supabase/migrations/20260626000003_runtime_hardening.sql`
4. `supabase/migrations/20260626000004_webapp_marketplace.sql`
5. `supabase/migrations/20260626000005_seed_or_config.sql`
6. `supabase/migrations/20260710000006_execution_leases.sql`
7. `supabase/migrations/20260711000007_marketplace_functional_integrity.sql`
8. `supabase/migrations/20260711000008_admin_media_usability.sql`

Con `psql`:

```bash
DATABASE_URL="postgresql://postgres:password@db.project-ref.supabase.co:5432/postgres" \
  scripts/apply-supabase-migrations.sh
```

Tambien puedes pegarlos en el SQL editor de Supabase, uno por uno, respetando
el orden. Si un SQL falla, para ahi: no sigas con los siguientes hasta entender
el error.

## Que Debe Pasar Tras Cada SQL

`001_core_schema.sql`

- Crea el core VIP Guard: `telegram_users`, `vip_groups`, `subscriptions`,
  `manual_payments`, `invite_links`, `bot_logs`, `admin_audit_logs`,
  `operational_incidents`, `admin_sessions`, `system_jobs`, etc.
- Crea tipos, indices y la funcion `admin_list_users`.
- Activa RLS en tablas operativas y deja el acceso real para `service_role`.

`002_payment_intents.sql`

- Crea `payment_intents` como cola manual futura/opcional.
- No activa pagos automaticos ni Stripe.
- En staging debe seguir con `NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=false` salvo
  prueba explicita de esa cola.

`003_runtime_hardening.sql`

- Crea `rate_limit_buckets`.
- Crea RPC `check_rate_limit(text, integer, integer)`.
- Crea `processed_telegram_updates` para deduplicar reintentos de Telegram por
  `update_id` sin guardar el payload completo.
- Activa RLS y revoca acceso directo a `anon`/`authenticated`.
- Da permisos a `service_role`.
- Es obligatorio en serverless/staging real: sin esto, el rate limit de API no
  queda distribuido y el webhook no puede deduplicar reintentos.

`004_webapp_marketplace.sql`

- Crea el catalogo WebApp: `creators`, `webapp_settings`, `vip_plans`,
  `marketplace_categories`, `marketplace_items`, `marketplace_item_images`,
  `purchase_interests`.
- Activa RLS y revoca acceso directo a `anon`/`authenticated`.
- Crea indices y constraints para estados, imagenes e intereses.

`005_seed_or_config.sql`

- Inserta bootstrap seguro/idempotente para settings/categorias/planes.
- No debe contener datos reales, tokens, precios definitivos ni media privada.
- Despues se reemplaza desde `/admin/webapp`.

## Comprobaciones Rapidas

Tablas clave:

```sql
select to_regclass('public.telegram_users') as telegram_users;
select to_regclass('public.subscriptions') as subscriptions;
select to_regclass('public.vip_groups') as vip_groups;
select to_regclass('public.webapp_settings') as webapp_settings;
select to_regclass('public.marketplace_items') as marketplace_items;
select to_regclass('public.purchase_interests') as purchase_interests;
select to_regclass('public.rate_limit_buckets') as rate_limit_buckets;
select to_regclass('public.processed_telegram_updates') as processed_telegram_updates;
```

RLS activo:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'telegram_users',
    'subscriptions',
    'vip_groups',
    'webapp_settings',
    'marketplace_items',
    'purchase_interests',
    'rate_limit_buckets',
    'processed_telegram_updates'
  )
order by tablename;
```

Resultado esperado: `rowsecurity = true` en todas las tablas public del proyecto.
`rate_limit_buckets` y `processed_telegram_updates` se usan solo con
`service_role`.

RPC `check_rate_limit`:

```sql
select public.check_rate_limit('staging-smoke', 3, 60000) as allowed;
```

Resultado esperado: `true` en las primeras llamadas. Si falla por funcion
inexistente, revisa `003_runtime_hardening.sql`.

Funcion `admin_list_users`:

```sql
select *
from public.admin_list_users('all', null, 5, 0, now());
```

Resultado esperado: 0 o mas filas, sin error. En una base limpia puede devolver
0 filas.

Bootstrap WebApp:

```sql
select key, is_public from public.webapp_settings order by key;
select name, status from public.vip_plans order by sort_order;
select title, status from public.marketplace_categories order by sort_order;
```

Resultado esperado: filas de arranque seguras/editables desde el dashboard.

## Storage Para Imagenes

El catalogo espera imagenes publicas en Supabase Storage o URLs permitidas. Para
staging:

1. Crea un bucket publico `creator-assets`.
2. Sube una imagen de prueba no sensible.
3. Copia la public URL en `/admin/webapp/marketplace`.
4. No subas contenido premium/privado a ese bucket.

## Diagnostico Desde La App

- `/api/health` es liveness simple y no requiere login.
- `/api/admin/health` requiere sesion admin y muestra variables/config basica.
- Si el dashboard carga pero listas dan `Supabase no configurado`, revisa
  `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel.

## Datos Iniciales Que No Van En SQL

Configura fuera de las migraciones:

- Token bot, webhook secret, cron secret, admin password y session secret.
- Grupo VIP desde `/admin/vip-guard/settings`.
- Branding/home desde `/admin/webapp/branding` y `/admin/webapp/home`.
- Planes, categorias, productos e imagenes desde `/admin/webapp`.
