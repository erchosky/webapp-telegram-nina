# Plataforma Telegram Nina

Plataforma modular para gestionar un bot de Telegram, accesos VIP, una MiniApp y el contenido de un catálogo desde paneles de administración.

Los cuatro módulos comparten Next.js 15, servicios de servidor y datos de Supabase. El pago y su validación son manuales; la MiniApp consulta el estado de acceso y no concede permisos por sí sola.

[Relación entre módulos](#relación-entre-módulos) · [Catálogo y solicitudes de interés](#catálogo-y-solicitudes-de-interés) · [Funciones activas y desactivadas](#funciones-activas-y-desactivadas) · [Tecnologías y entorno](#tecnologías-y-entorno) · [Desarrollo local](#desarrollo-local) · [Pruebas y verificación](#pruebas-y-verificación)

---

## Relación entre módulos

VIP Guard es la autoridad sobre `telegram_users`, `subscriptions`, `vip_groups`, invitaciones, expulsiones y operación del grupo. La MiniApp solo consulta ese estado y prepara o registra solicitudes; nunca concede acceso por sí misma.

El CMS WebApp administra `webapp_settings`, `vip_plans`, `marketplace_categories`, `marketplace_items` y `marketplace_item_images`. La MiniApp lee ese contenido a través de `GET /api/marketplace`. Los intereses se crean mediante `POST /api/marketplace/interest` y se gestionan en `/admin/webapp/interests`. `purchase_interests.category_id` conserva la categoría existente cuando se hizo la solicitud, aunque después el artículo se mueva o archive.

Todo acceso de aplicación a Supabase utiliza `service_role` exclusivamente en módulos de servidor. Las tablas revocan acceso a `anon` y `authenticated`; la autorización efectiva depende de las validaciones de `initData`, sesión admin, origen y permisos ejecutadas antes de cada operación. La MiniApp no conecta directamente a Supabase, Realtime ni Storage.

## Catálogo y solicitudes de interés

El catálogo activo es dinámico y canónico; no depende de datos escritos en componentes. El usuario puede ver categorías publicadas, abrir el detalle de un artículo, consultar imagen, descripción, condiciones, precio/etiqueta y registrar interés. Un artículo oculto/archivado o perteneciente a una categoría no publicada no aparece y tampoco acepta solicitudes directas por ID.

Desde `/admin/webapp` se pueden gestionar:

- categorías: alta, nombre, descripción, imagen pública, estado, orden y archivo seguro;
- artículos: alta, detalle, condiciones, categoría, imagen, precio, CTA, tipo, entrega, estado, visibilidad, destacado, orden y archivo;
- personalización controlada: nombre de marca, título, introducción, cabecera, mensajes vacíos y textos de disponibilidad;
- intereses: filtros, usuario, artículo, categoría histórica, fecha, estado y notas internas.

Los fixtures de `lib/marketplace/catalog.ts` solo se habilitan en desarrollo con `NEXT_PUBLIC_ENABLE_MARKETPLACE_FIXTURES=true`; están bloqueados en producción. `supabase/seed.sql` contiene únicamente datos sintéticos para el entorno local reproducible.

## Funciones activas y desactivadas

Activas: bot/webhook, dashboard VIP Guard, cron de expiraciones, MiniApp, CMS WebApp, marketplace e intereses manuales.

Desactivadas por defecto:

- referidos: `NEXT_PUBLIC_ENABLE_REFERRALS=false`;
- payment intents: `NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=false`;
- fixtures de marketplace: `NEXT_PUBLIC_ENABLE_MARKETPLACE_FIXTURES=false`.

No hay checkout, Stripe ni concesión automática de acceso por pagos. El pago y la validación siguen siendo manuales. No hay acceso cliente directo a Supabase Realtime.

## Tecnologías y entorno

Requiere Node 22, npm, Docker/Colima y Supabase CLI. Copia `.env.example` a `.env.local`; nunca incluyas ese archivo en Git o en el ZIP. Las variables principales son `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, secretos de Telegram/cron/admin/sesión y las variables `NEXT_PUBLIC_*` documentadas en `.env.example`.

Valida sin imprimir secretos:

```bash
npm run check:env
```

## Desarrollo local

```bash
npm ci
npm run supabase:start
npm run supabase:reset
npm run supabase:wait
npm run dev
```

La ruta `/` requiere `initData` válido. `/dev`, `/dev/sandbox` y `/e2e-harness/telegram` están condicionadas a desarrollo/pruebas y devuelven 404 en el build normal. La guía completa está en [docs/INTEGRATION_PLATFORM.md](docs/INTEGRATION_PLATFORM.md).

## Pruebas y verificación

Verificación completa desde volúmenes locales vacíos, incluida una segunda reconstrucción de base:

```bash
npm run verify:local:full
```

Comandos individuales:

```bash
npm run test:db
npm run supabase:lint
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run test:integration
npm run test:integration:coverage
npm run db:performance
npm run build
npm run test:e2e:build
npm run test:e2e
npm audit --audit-level=high
```

## ZIP limpio

```bash
npm run zip:clean
npm run zip:verify
```

El artefacto se genera en `_exports/webapptelegram-nina-clean.zip`. La verificación excluye `.env*` privados, secretos, `.next`, `node_modules`, cobertura, logs, estado local de Supabase, temporales y datos personales, e incluye `FINAL_REPORT.md`.

## Validaciones pendientes en el entorno de pruebas

El entorno local usa Telegram simulado y Supabase local. Antes de producción deben verificarse en staging: webhook y permisos con bot real, entrega/expiración de invitaciones reales, expulsión y desbloqueo en un grupo real, alertas Telegram, dominio/TLS/CSP de Vercel, cabeceras del proxy real y comportamiento de WebView en Telegram iOS/Android. Consulta [docs/STAGING_E2E_CHECKLIST.md](docs/STAGING_E2E_CHECKLIST.md).

## Documentación vigente

- [Arquitectura oficial](docs/FUSION_ARCHITECTURE.md)
- [Plataforma local reproducible](docs/INTEGRATION_PLATFORM.md)
- [Marketplace](docs/MARKETPLACE.md)
- [Modelo service role](docs/SERVICE_ROLE_MODEL.md)
- [Instalación Supabase](docs/SUPABASE_FRESH_SETUP.md)
- [Checklist de staging](docs/STAGING_E2E_CHECKLIST.md)
- [Despliegue Vercel](docs/VERCEL_STAGING.md)
- [Configuración del bot](docs/TELEGRAM_BOT_SETUP.md)
- [Backup y restauración](docs/BACKUP_RESTORE.md)

`docs/FUSION_WITH_VIP_GUARD.md` y `docs/FUTURE_INTEGRATION.md` se conservan como contexto histórico y ya no describen el estado actual.
