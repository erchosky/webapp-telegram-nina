# Testing

Comandos de aceptación:

```bash
npm run test
npm run test:coverage
npm run typecheck
npm run lint
npm run build
npm run zip:clean
```

Cobertura actual:

- Firma y validación de Telegram `initData`
- Extracción de `Authorization: tma`
- Selección de suscripción actual
- Suscripción activa/no expirada
- Servicios internos de códigos de referido, apagados en UI por defecto
- Carrera de `ensureReferralCode`
- Idempotencia de `createPaymentIntent`
- Carrera por unique violation `23505` en `payment_intents` como módulo opcional/futuro
- Invite caducado
- Usuario sin VIP intentando ver invite
- Errores DB genéricos al cliente
- Resolución segura del botón de contacto
- Sincronía estructural de textos ES/EN/PT
- Modo dev local sin llamadas a Supabase real
- Flow engine y navegación de nodos
- Planes configurables
- ZIP limpio exportable

Los tests de servicios usan Supabase mockeado y no requieren `.env.local`.

`npm run test:coverage` usa el proveedor V8 de Vitest y genera el resumen en
terminal, `coverage/coverage-summary.json`, `coverage/lcov.info` y un informe
HTML local. La carpeta de cobertura está ignorada por Git.
