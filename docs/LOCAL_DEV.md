# Local Dev

```bash
npm run dev
open http://localhost:3000/dev
```

La MiniApp local muestra la navegación final:

- Inicio
- Acceso
- Catálogo privado
- Contacto

El mock local no toca Telegram real ni Supabase.

Estados disponibles:

- Onboarding / Home
- Sin acceso
- Eligiendo plan
- Acceso activo
- Acceso caducado
- Pago pendiente
- Invitación disponible
- Invitación usada
- Invitación caducada
- Error de API simulado
- Cargando

Botones simulados:

- "Hablar con Nina": muestra el enlace y mensaje preparado.
- "Preguntar por esta pieza": muestra el mensaje del Catálogo.
- "Abrir enlace": muestra el enlace local que se abriría.
- "Problema con mi enlace": prepara contacto con mensaje de soporte.

Referidos queda fuera de la navegación principal. Sus APIs y pantalla legacy
siguen detrás de `NEXT_PUBLIC_ENABLE_REFERRALS=true`.
Payment intents solo se usa con `NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=true`.
Ese flag es experimental y debe mantenerse apagado salvo prueba tecnica local;
la bandeja administrativa de resolución está disponible en `/admin/webapp/interests`.
