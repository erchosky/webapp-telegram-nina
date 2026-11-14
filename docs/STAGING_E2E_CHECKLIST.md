# Staging E2E Checklist

Usa un bot, grupo y Supabase de staging. No ejecutes esta checklist contra el
grupo real hasta terminarla completa.

## 1. Login Admin

- Accion: abre `/admin/login` y entra con `ADMIN_PASSWORD`.
- Donde: Vercel staging.
- Resultado esperado: ves selector admin y dashboards VIP Guard/WebApp.
- Supabase: `admin_sessions` tiene una sesion no revocada.
- Telegram: nada.
- Si falla: revisa `ADMIN_PASSWORD`, `SESSION_SECRET`, cookies y
  `/api/admin/health` tras iniciar sesion.

## 2. Configurar Grupo VIP

- Accion: entra en `/admin/vip-guard/settings`, rellena Chat ID, textos y guarda.
- Donde: Dashboard VIP Guard.
- Resultado esperado: grupo activo guardado; no activar autoexpulsion todavia.
- Supabase: `vip_groups` tiene `telegram_chat_id`, `is_active=true`.
- Telegram: bot ya es admin del grupo.
- Si falla: confirma que `TELEGRAM_GROUP_CHAT_ID` coincide y que el bot esta en
  el grupo.

## 3. Probar Permisos Bot

- Accion: pulsa `Probar bot y grupo`.
- Donde: `/admin/vip-guard/settings`.
- Resultado esperado: grupo encontrado, bot dentro, bot admin, puede crear
  enlaces y puede restringir miembros.
- Supabase: `bot_health_checks` registra `ok=true`.
- Telegram: nada visible salvo actividad normal.
- Si falla: ajusta permisos admin del bot en Telegram y repite.

## 4. Crear Usuario Fake

- Accion: desde una cuenta Telegram de prueba abre el bot y envia `/start`.
- Donde: Telegram.
- Resultado esperado: el bot responde y registra usuario.
- Supabase: `telegram_users` tiene `telegram_user_id`, username/nombre y
  `started_bot_at`.
- Telegram: el usuario puede abrir la MiniApp desde el boton.
- Si falla: revisa webhook, token bot y logs de Vercel.

## 5. Validar Pago Manual 7 Dias

- Accion: en `/admin/vip-guard/users`, busca el usuario y pulsa `Validar 7 dias`.
- Donde: Dashboard VIP Guard.
- Resultado esperado: suscripcion activa por 7 dias; se intenta enviar invite.
- Supabase: `subscriptions.status='active'`; `manual_payments` contiene ledger
  de validacion manual.
- Telegram: el usuario recibe mensaje con enlace si hizo `/start`.
- Si falla: revisa incidencias, `bot_logs` y permisos para crear enlaces.

## 6. Comprobar Ledger Manual Payments

- Accion: consulta pagos del usuario.
- Donde: Supabase SQL editor.
- Resultado esperado:

```sql
select *
from public.manual_payments
order by created_at desc
limit 10;
```

- Supabase: hay fila con usuario, moneda/notas/duracion segun accion.
- Telegram: nada.
- Si falla: no sigas con produccion; revisa `lib/payment-validation.ts` y logs.

## 7. Generar Invite

- Accion: si no llego automaticamente, pulsa `Enviar enlace` o reintenta desde
  la ficha.
- Donde: Dashboard VIP Guard, ficha de usuario.
- Resultado esperado: invite unico generado y marcado enviado.
- Supabase: `invite_links` tiene `invite_link`, `sent_at`, `subscription_id`.
- Telegram: usuario recibe enlace.
- Si falla: revisa `operational_incidents`, permisos del bot y si el usuario
  bloqueo el bot.

## 8. Entrar Al Grupo

- Accion: abre el invite desde la cuenta fake.
- Donde: Telegram.
- Resultado esperado: el usuario entra al grupo privado de staging.
- Supabase: `invite_links.used_at` puede actualizarse si Telegram notifica el
  evento; la suscripcion sigue activa.
- Telegram: el usuario aparece en el grupo.
- Si falla: comprueba que el enlace no este usado/caducado y que el grupo sea
  el de staging.

## 9. Comprobar Active In Group

- Accion: revisa ficha del usuario y estado operativo.
- Donde: Dashboard VIP Guard.
- Resultado esperado: usuario activo, sin incidencia pendiente.
- Supabase: `telegram_users.operational_status` no debe quedar en error.
- Telegram: usuario permanece en grupo.
- Si falla: revisa logs de membership/webhook.

## 10. Crear Producto Marketplace

- Accion: crea categoria si hace falta y crea producto.
- Donde: `/admin/webapp/categories` y `/admin/webapp/marketplace`.
- Resultado esperado: producto visible en MiniApp si `public_visible=true` y
  estado disponible/reservado.
- Supabase: filas en `marketplace_categories` y `marketplace_items`.
- Telegram: MiniApp muestra producto al abrir desde el bot.
- Si falla: revisa `/api/marketplace` y `NEXT_PUBLIC_ENABLE_MARKETPLACE_FIXTURES=false`.

## 11. Anadir Imagen

- Accion: sube imagen publica no sensible a bucket `creator-assets` y pega URL.
- Donde: Supabase Storage y `/admin/webapp/marketplace`.
- Resultado esperado: miniatura visible en admin y MiniApp.
- Supabase: `marketplace_item_images.public_url`, `is_primary=true`.
- Telegram: MiniApp muestra imagen o fallback si falla.
- Si falla: revisa que la URL sea publica y host permitido.

## 12. Crear Interes

- Accion: desde cuenta fake pulsa CTA de producto en MiniApp.
- Donde: Telegram MiniApp.
- Resultado esperado: interes registrado y mensaje preparado para copiar/enviar.
- Supabase: `purchase_interests` tiene `status='requested'`.
- Telegram: alerta admin llega a `TELEGRAM_ADMIN_ALERT_CHAT_ID` si esta bien
  configurado.
- Si falla: revisa `/api/marketplace/interest`, token bot y chat de alertas.

## 13. Marcar Interes Contactado/Cerrado

- Accion: en `/admin/webapp/interests`, filtra pendientes y usa acciones rapidas.
- Donde: Dashboard WebApp.
- Resultado esperado: pasa a `seen` y luego `resolved`.
- Supabase: `purchase_interests.status` cambia sin tocar schema.
- Telegram: nada obligatorio.
- Si falla: revisa sesion admin, same-origin y read-only mode.

## 14. Simular Expiracion

- Accion: cambia `ends_at` del usuario fake a una fecha pasada o usa gestor de
  caducidad con cuidado.
- Donde: Supabase SQL editor o ficha admin.
- Resultado esperado: usuario queda candidato a expiracion.
- Supabase:

```sql
update public.subscriptions
set ends_at = now() - interval '5 minutes'
where telegram_user_id = '<uuid-del-usuario>'
  and status = 'active';
```

- Telegram: nada inmediato.
- Si falla: usa un usuario fake y confirma UUID interno, no Telegram numeric ID.

## 15. Ejecutar Cron Manual

- Accion:

```bash
curl -sS -X POST "${NEXT_PUBLIC_APP_URL}/api/cron/check-expired" \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

- Donde: terminal.
- Resultado esperado: JSON ok/resumen; suscripcion caducada detectada.
- Supabase: `subscriptions.status='expired'`, `bot_logs` y/o
  `admin_audit_logs` registran evento.
- Telegram: si autoexpulsion esta desactivada, no expulsa.
- Si falla: `401` secret mal, `429` rate limit, `500` revisar logs Vercel.

## 16. Comprobar Expulsion

- Accion: solo tras pruebas previas, activa autoexpulsion en settings y repite
  expiracion con usuario fake.
- Donde: Dashboard VIP Guard y cron manual.
- Resultado esperado: usuario fake sale del grupo o queda incidencia clara.
- Supabase: `expulsion_status`, `expelled_at` o `operational_incidents`.
- Telegram: usuario ya no esta en grupo.
- Si falla: permisos bot de restringir/banear, estado de grupo o race de acceso
  activo.

## 17. Renovar Usuario

- Accion: desde ficha del usuario pulsa renovar/validar.
- Donde: Dashboard VIP Guard.
- Resultado esperado: suscripcion vuelve a activa y se genera nuevo invite si
  necesita reentrada.
- Supabase: nueva fecha `ends_at`, ledger en `manual_payments`.
- Telegram: usuario recibe nuevo enlace si corresponde.
- Si falla: revisa errores en query param y ficha de usuario.

## 18. Comprobar Reentrada

- Accion: abre nuevo invite desde Telegram.
- Donde: Telegram.
- Resultado esperado: usuario reentra al grupo.
- Supabase: invite actual asociado a suscripcion.
- Telegram: usuario aparece en grupo.
- Si falla: enlace usado/caducado, bot sin permisos o usuario bloqueado.

## 19. Export CSV

- Accion: abre `/api/admin/users/export` desde sesion admin.
- Donde: navegador con login admin.
- Resultado esperado: descarga CSV.
- Supabase: no escribe nada.
- Telegram: nada.
- Si falla: revisa sesion admin y logs de Vercel.

## 20. Revisar Incidencias Y Logs

- Accion: abre `/admin/vip-guard/incidents`, `/admin/vip-guard/logs` y ficha.
- Donde: Dashboard VIP Guard.
- Resultado esperado: eventos entendibles, sin secretos, con acciones de
  reintento/resolucion cuando aplique.
- Supabase: `bot_logs`, `admin_audit_logs`, `operational_incidents`.
- Telegram: solo eventos esperados.
- Si falla: no borres incidencias; captura contexto y corrige antes de staging
  final.

## Cierre De Checklist

Staging esta listo cuando:

- health publico y admin pasan;
- BotFather webhook no muestra errores;
- grupo VIP pasa prueba de permisos;
- usuario fake completa alta, invite, entrada, expiracion, expulsion y renovacion;
- marketplace crea producto, imagen e interes;
- alertas admin llegan;
- CSV exporta;
- ZIP limpio verifica sin secretos.
