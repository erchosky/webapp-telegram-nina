# Documento histórico: Future Integration With VIP Guard

> **Estado:** histórico, no normativo. Las APIs, dashboards y tablas descritos aquí como futuros ya se integraron. Consulta `README.md` y `docs/FUSION_ARCHITECTURE.md` para el estado vigente.

## Roles

WebAppTelegram Nina es la experiencia pública/cliente:

- Home, Acceso, Catálogo privado y Contacto.
- Visualización de estado de acceso.
- CTAs para entrar, renovar, consultar productos o pedir ayuda.
- Mensajes preparados para Nina/admin.
- Intenciones manuales de interés o compra.
- Consumo de datos ya preparados por backend.

VIP Guard sigue siendo el cerebro operativo:

- bot de Telegram;
- dashboard privado;
- usuarios;
- suscripciones;
- altas y renovaciones;
- expiraciones y expulsiones;
- logs;
- incidencias;
- settings;
- administración del grupo VIP.

La WebApp no debe duplicar dashboard, bot, expulsiones, broadcasts,
validaciones admin de pago, gestión de incidencias ni administración de grupos.

La separación completa de dashboards, tablas y ownership está en
`docs/VIP_GUARD_MINIAPP_ARCHITECTURE.md`.

## Partes A Compartir En El Futuro

- Tipos de usuario: `TelegramUserRow`, DTO público de usuario y campos de perfil.
- Tipos de suscripción: `SubscriptionStatus`, fechas y estado efectivo de acceso.
- Estado de acceso: `lib/client/subscriptionState.ts` y
  `lib/services/subscription.ts`.
- Planes: `lib/miniapp/plans.ts`, hoy versionados; futuro origen candidato:
  settings/admin de VIP Guard.
- Grupo VIP: `VipGroupRow` y campos públicos de instrucciones/contacto.
- Enlaces de invitación: `InviteDTO`, estados `available`, `expired`, `used`,
  `revoked`, `inactive_subscription`.
- Payment intents manuales: contrato de `docs/PAYMENT_INTENTS_CONTRACT.md`.
- Marketplace: categorías, productos, media, estados comerciales e intención
  manual de interés. Producción debe venir de base de datos/CMS interno, no de
  productos hardcodeados.
- Referrals: mantener apagado hasta cerrar contrato de negocio.
- Telegram: validación de `initData`, helpers de WebApp y mensajes preparados.
- Supabase: cliente admin server-side y contratos de tablas compartidas.

## Contratos A Alinear

- `telegram_users`
- `subscriptions`
- `vip_groups`
- `invite_links`
- `payment_intents` si se activa
- `referral_codes` y `referral_rewards` si se activa referidos
- `webapp_settings`, `vip_plans`
- `marketplace_categories`, `marketplace_items`
- `marketplace_item_images`
- `purchase_interests`

## Endpoints Potenciales

- WebApp -> VIP Guard: `GET /api/me`
- WebApp -> VIP Guard: `GET /api/invite`
- WebApp -> VIP Guard: `POST /api/payments/intent`
- Futuro: `POST /api/marketplace/interest`
- Futuro: `GET /api/marketplace`
- Futuro: `GET /api/miniapp/content`
- Futuro: `GET /api/plans`

Los endpoints deben validar Telegram `initData` en servidor y no exponer
service role keys ni UUIDs internos innecesarios.

## Riesgos Al Fusionar

- Duplicar reglas de suscripción entre WebApp y VIP Guard.
- Activar pagos automáticos sin contrato operativo cerrado.
- Exponer datos admin en DTOs públicos.
- Mostrar un grupo VIP arbitrario cuando haya varios grupos activos.
- Mezclar referidos con invitaciones.
- Acoplar UI de creadora a datos hardcodeados.
- Romper rutas dev o mocks al pasar a producción.

## Orden Recomendado De Fusión

1. Congelar contratos compartidos de tipos y estados.
2. Decidir origen administrable de planes visibles y marketplace.
3. Unificar validación de Telegram `initData`.
4. Alinear `MeDTO`, `InviteDTO` y `PaymentIntentDTO`.
5. Conectar WebApp a endpoints operativos de VIP Guard.
6. Migrar catálogo/planes a datos administrables si procede.
7. Activar `payment_intents` manuales solo con revisión admin.
8. Revisar referidos por separado.
9. Hacer smoke test con Supabase staging.
10. Solo después plantear fusión de repositorios.

## Checklist Pre-Fusión

- No hay Stripe ni checkout automático.
- No hay dashboard ni bot dentro de la WebApp.
- `npm run test`, `lint`, `typecheck`, `build` pasan.
- ZIP limpio sin secretos ni artefactos.
- DTOs públicos revisados.
- RLS y service role revisados.
- Variables de entorno separadas de configuración pública.
- Documentos de contratos actualizados.
