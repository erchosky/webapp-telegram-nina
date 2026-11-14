# Plataforma local de integración

Esta plataforma reproduce localmente las superficies críticas de la aplicación
sin credenciales ni datos reales. Incluye PostgreSQL/Supabase, Auth, PostgREST,
Storage, una API falsa de Telegram, Next.js en modo producción, tests pgTAP,
integración real, HTTP y Playwright.

## Prerrequisitos

- Node.js 22.x y npm.
- Docker Engine compatible con Docker Compose.
- En macOS puede utilizarse Docker Desktop o Colima.
- Aproximadamente 8 GB libres para imágenes de Supabase y Chromium.

No copie un `.env` real. Supabase CLI genera claves locales fijas y el runner
E2E inyecta exclusivamente secretos sintéticos en el proceso local.

## Uso rápido

```bash
npm ci
npm run test:e2e:install
npm run verify:local:full
```

El comando completo inicia Supabase, reconstruye y siembra la base, ejecuta
pgTAP/RLS, lint, typecheck, tests y coberturas, mide PostgreSQL, construye
Next.js, ejecuta Chromium escritorio/móvil, audita dependencias y reconstruye
la base una segunda vez antes de repetir pgTAP e integración.

Para destruir también volúmenes y estado local:

```bash
npm run supabase:clean
```

## Comandos por capa

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:wait
npm run test:db
npm run supabase:lint
npm test
npm run test:coverage
npm run test:integration
npm run test:integration:coverage
npm run db:performance
npm run test:e2e:build
npm run test:e2e
npm run supabase:stop
```

`supabase:reset` aplica, en orden, todos los archivos de
`supabase/migrations/` y después el seed determinista. El script de rendimiento
no conserva sus 5.000 usuarios, 5.000 suscripciones, 2.000 productos, 10.000
intereses ni 10.000 eventos: todo se ejecuta entre `BEGIN` y `ROLLBACK`.

## Arquitectura de pruebas

| Capa | Ejecución | Qué demuestra |
|---|---|---|
| Unitarios | Vitest | contratos, branches, autorización pura y errores |
| RLS/esquema | pgTAP contra PostgreSQL local | grants, RLS, RPC privadas, constraints y leases |
| Integración | Vitest + Supabase local | roles reales, Storage, catálogo, CAS, rate limit y concurrencia |
| HTTP | Playwright + Next producción | autenticación, payloads, caché, cron y webhook reales |
| Navegador | Playwright Chromium | MiniApp, admin, CSV, estados y viewport móvil |
| Telegram | servidor loopback | grammY, llamadas Bot API, fallos, retrasos y contadores |
| Rendimiento | PostgreSQL local | planes reales con buffers y tiempos |

## Harness y servidor Telegram

La ruta `/e2e-harness/telegram` sólo responde cuando el proceso servidor tiene
`E2E_TEST_MODE=1`; en cualquier build ordinario devuelve 404. Genera `initData`
con el algoritmo HMAC de Telegram y el token ficticio del runner. No desactiva
la validación de producción.

`scripts/e2e-server.mts` obtiene la URL y la clave `service_role` de la instancia
local, inicia `test/support/fake-telegram-server.mts` en loopback e inicia
`next start`. El override de Bot API sólo acepta un origen HTTP(S) loopback y
sólo se activa con `E2E_TEST_MODE=1`.

## Fixtures

Todos los IDs, nombres, usernames, correos y secretos son sintéticos. El seed
incluye tres identidades Telegram, una sesión admin, membresías activa,
pendiente y cancelada, catálogo publicado/oculto, intereses de propietarios
distintos, Storage público/privado y un update procesado.

## Límites de lo local

La plataforma verifica el protocolo esperado, pero no sustituye staging para:

- entrega desde los servidores reales de Telegram y configuración real del webhook;
- permisos y moderación de un supergrupo real;
- límites, latencia y fallos de red reales de Telegram/Supabase/Vercel;
- cabeceras impuestas por el proxy/CDN final;
- Realtime si se habilita en el futuro;
- backup, restore, observabilidad y rotación de secretos del proveedor.
