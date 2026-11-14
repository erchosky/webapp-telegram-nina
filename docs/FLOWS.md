# Flujos de la MiniApp

La experiencia principal vive en `components/screens/JourneyScreen.tsx`.

## Flujo Actual

- Inicio presenta saludo, estado resumido, CTA inteligente y la pregunta
  "¿Qué quieres hacer?".
- Acceso agrupa estado, renovación e invitación.
- Catálogo privado usa `lib/marketplace/catalog.ts`.
- Contacto prepara mensajes y contiene información secundaria de
  cuenta, normas y privacidad.

El flujo guiado legacy de acceso queda corto y sin CTAs de pago automático:

`home -> vip_includes -> choose_plan -> contact_admin`

## Acciones

- `contact_admin`: abre Telegram o muestra preview local con mensaje preparado.
- `next`: navega dentro del flujo guiado de acceso.
- `reset`: vuelve a Inicio.

Con `NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=false`, el flujo de acceso no llama
`POST /api/payments/intent`; termina en contacto manual.

## Planes De Acceso

Los planes viven en `lib/miniapp/plans.ts`. No son Catálogo privado. Sirven para
preparar contexto de alta o renovación.
