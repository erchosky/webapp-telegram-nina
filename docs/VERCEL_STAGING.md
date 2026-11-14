# Vercel Staging Setup

## Proyecto

1. Crea un proyecto Vercel nuevo para staging.
2. Importa el ZIP/repo.
3. Node.js: `22.x`.
4. Build command: `npm run build`.
5. Install command: `npm ci`.
6. Output: default de Next.js.

El `package.json` ya declara:

```json
"engines": { "node": "22.x" }
```

## Variables Necesarias

Configura en Vercel, Environment `Preview` o un proyecto dedicado de staging:

```env
NEXT_PUBLIC_APP_URL=https://tu-proyecto-staging.vercel.app
SUPABASE_URL=https://project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_GROUP_CHAT_ID=-100...
TELEGRAM_ADMIN_ALERT_CHAT_ID=...
CRON_SECRET=...
ADMIN_PASSWORD=...
SESSION_SECRET=...
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS=7200
NEXT_PUBLIC_ENABLE_REFERRALS=false
NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=false
NEXT_PUBLIC_ENABLE_MARKETPLACE_FIXTURES=false
NEXT_PUBLIC_CREATOR_NAME=...
NEXT_PUBLIC_PRODUCT_NAME=...
NEXT_PUBLIC_ADMIN_CONTACT=@...
```

Opcionales:

```env
APP_VERSION=staging-001
CRON_BATCH_SIZE=50
```

No subas `.env.local` a Vercel ni al ZIP. Usa el panel de Vercel.

## Validar Env Local Antes De Deploy

```bash
cp .env.example .env.local
# rellena valores reales de staging
npm run check:env
```

El script no llama APIs ni imprime secretos; solo valida presencia/formato y
placeholders.

## Health Checks

Liveness publica:

```bash
curl -i https://tu-proyecto-staging.vercel.app/api/health
```

Esperado:

```json
{ "ok": true, "type": "liveness" }
```

Health admin/config:

1. Entra en `/admin/login`.
2. Abre `/api/admin/health` en la misma sesion.

Esperado:

- `ok: true`;
- `hasSupabaseUrl: true`;
- `hasServiceRole: true`;
- `hasTelegramToken: true`;
- `hasWebhookSecret: true`;
- `hasCronSecret: true`;
- `hasAdminPassword: true`;
- `hasSessionSecret: true`;
- `hasTelegramGroupChatId: true`;
- `paymentIntents: "disabled"` para staging normal.

Middleware protege `/admin/:path*` y `/api/admin/:path*`, pero no sustituye la
autorizacion interna: toda pagina admin debe llamar `requireAdmin()` y toda API
admin debe llamar `isAdmin()` o `requireAdmin()` antes de devolver datos.

## Cron

`vercel.json` configura:

```json
{
  "crons": [
    { "path": "/api/cron/check-expired", "schedule": "0 6 * * *" }
  ]
}
```

Esta configuracion es diaria para ser compatible con Vercel Hobby. No asumas
cron horario en Hobby. Si necesitas ejecuciones cada hora, usa un cron externo
que llame la misma ruta con Bearer token.

Llamada manual:

```bash
curl -sS -X POST "https://tu-proyecto-staging.vercel.app/api/cron/check-expired" \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

Tambien se admite `GET` con el mismo header para servicios externos que no
permiten `POST`. Esperado: JSON con resumen del cron. `401` significa secret
incorrecto. `429` significa demasiadas llamadas en poco tiempo.

Alternativas externas:

- GitHub Actions scheduled workflow.
- cron-job.org.
- UptimeRobot/Better Stack con header Authorization.

Siempre envia:

```http
Authorization: Bearer <CRON_SECRET>
```

## Webhook Telegram

Despues de deploy y variables:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${NEXT_PUBLIC_APP_URL}/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message","callback_query","my_chat_member","chat_member","chat_join_request"]' \
  -d "drop_pending_updates=true"
```

Reejecuta `setWebhook` despues de cualquier cambio en `allowed_updates`; no se
actualiza solo por redeploy.

Luego:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

## Deploy Seguro

Antes de deploy:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm audit
npm run zip:verify
```

Despues de deploy:

1. `/api/health`.
2. Login admin.
3. `/api/admin/health`.
4. `/admin/vip-guard/settings` -> probar bot y grupo.
5. Abrir MiniApp desde Telegram.

## Hobby Vs Pro

- Hobby puede ser suficiente para staging manual, pero revisa limites de cron,
  ejecucion y cold starts.
- Pro es preferible para pruebas largas de cron/expulsion y uso multiusuario.
- Si el cron de Vercel no encaja, manten Vercel Hobby y usa cron externo con
  `CRON_SECRET`.
