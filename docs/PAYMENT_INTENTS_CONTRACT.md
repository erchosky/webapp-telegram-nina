# Payment Intents Contract

`payment_intents` queda como infraestructura opcional/futura.
No actives `NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=true` en staging/produccion hasta
que exista una bandeja admin de resolucion. La health admin lo marcara como
`experimental_enabled_no_admin_resolution_inbox` si alguien lo activa.

Flag:

```env
NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=false
```

Con la flag en `false`:

- la UI no muestra CTAs de aviso de pago ya realizado;
- la UI no muestra botones para enviar avisos internos de pago;
- la UI no llama `POST /api/payments/intent`;
- el flujo termina en contacto manual con Nina/admin.

Si se activa en el futuro, `payment_intents` debe seguir siendo solo un aviso
pendiente de revisión manual. No confirma pagos, no activa suscripciones, no
genera invitaciones, no mete usuarios en grupos y no expulsa usuarios.
Mientras no exista la bandeja de resolucion, una solicitud pendiente no debe
ocultar la via de contacto/pago/renovacion manual.

## Flujo Futuro Opcional

1. Usuario coordina el pago con Nina/admin.
2. MiniApp crea un intent con `status = 'requested'`.
3. Administración revisa manualmente.
4. Administración marca `seen`, `resolved` o `cancelled`.
5. El acceso se activa o renueva por el flujo interno existente de VIP Guard/admin.

## Seguridad

La migración activa RLS y revoca acceso a `anon`/`authenticated`. La escritura
debe hacerse solo desde API routes server-side con service role.
