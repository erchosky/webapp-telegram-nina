# Telegram / BotFather Setup

Esta guia prepara el bot para staging real: MiniApp, webhook y grupo VIP.

## Crear Bot

1. Abre `@BotFather`.
2. Ejecuta `/newbot`.
3. Guarda el token en `TELEGRAM_BOT_TOKEN`.
4. No pegues el token en issues, logs, capturas ni SQL.

Si ya existe el bot operativo de VIP Guard, usa ese bot para staging solo si no
interfiere con produccion. Lo recomendable es un bot de staging separado.

## Configurar MiniApp / WebApp URL

1. Despliega en Vercel y consigue una URL HTTPS estable.
2. En BotFather usa `/setmenubutton` para el bot de staging.
3. Selecciona Web App y configura `NEXT_PUBLIC_APP_URL`, por ejemplo:
   `https://tu-proyecto-staging.vercel.app`.
4. La URL debe apuntar a `/`, no a `/dev`.
5. Abre el bot desde Telegram y pulsa el boton. Fuera de Telegram, `/` no tendra
   `initData` real.

## Configurar Webhook

Define un secret fuerte, sin espacios, en `TELEGRAM_WEBHOOK_SECRET`. Telegram lo
enviara en el header `x-telegram-bot-api-secret-token`.

Configura el webhook:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${NEXT_PUBLIC_APP_URL}/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message","callback_query","my_chat_member","chat_member","chat_join_request"]' \
  -d "drop_pending_updates=true"
```

Si cambias `allowed_updates`, vuelve a ejecutar `setWebhook`; Telegram mantiene
la configuracion anterior hasta que la reemplazas explicitamente.

Comprueba:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Resultado esperado:

- `url` apunta a `/api/telegram/webhook`.
- `last_error_message` esta vacio.
- `pending_update_count` no crece indefinidamente.

## Anadir Bot Al Grupo VIP

1. Crea un grupo privado de staging.
2. Anade el bot al grupo.
3. Hazlo administrador.
4. Activa permisos necesarios:
   - crear enlaces de invitacion;
   - restringir miembros;
   - expulsar/banear miembros si Telegram lo muestra separado;
   - leer mensajes basicos del grupo si aplica.
5. No actives autoexpulsion hasta terminar el checklist E2E.

## Obtener Chat ID

Opciones:

- Escribe `/id` en el grupo si el bot implementa ese comando.
- Revisa logs del webhook en Vercel despues de enviar un mensaje al grupo.
- Usa temporalmente `getUpdates` solo si no hay webhook activo o despues de
  borrar webhook en un bot de staging.

El Chat ID de supergrupo suele empezar por `-100`. Guarda el valor en:

```env
TELEGRAM_GROUP_CHAT_ID=-1001234567890
```

Despues configura el grupo desde `/admin/vip-guard/settings` y pulsa
`Probar bot y grupo`.

## Alertas Admin

`TELEGRAM_ADMIN_ALERT_CHAT_ID` es donde llegan alertas de intereses del
marketplace. Puede ser un chat privado contigo, un grupo admin o un canal donde
el bot pueda escribir.

No usa `TELEGRAM_GROUP_CHAT_ID` como fallback: si falta, la app registra el
interes pero no envia alerta Telegram.

## Probar /start

1. Abre el bot como usuario de prueba.
2. Envia `/start`.
3. Esperado:
   - el bot responde;
   - se crea/actualiza `telegram_users`;
   - `started_bot_at` queda relleno;
   - `/api/me` puede reconocer al usuario al abrir la MiniApp.

## Probar Entrada Al Grupo

1. En admin, valida acceso manual al usuario de prueba.
2. Comprueba que recibe un enlace por Telegram.
3. Abre el enlace desde Telegram.
4. Esperado:
   - el usuario entra al grupo;
   - el enlace no se reutiliza para otro usuario;
   - el dashboard muestra suscripcion activa.

## Problemas Frecuentes

- `401` en webhook: `TELEGRAM_WEBHOOK_SECRET` no coincide con BotFather/API.
- `/api/me` devuelve `401`: la MiniApp no se abrio desde Telegram o el token del
  bot no corresponde.
- No llega invitacion: el usuario no ha hecho `/start`, bloqueo el bot o falta
  permiso para crear enlaces.
- No expulsa en pruebas: falta permiso de restringir/banear o autoexpulsion
  sigue desactivada.
