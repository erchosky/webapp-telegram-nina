# Button Flows

La experiencia visible termina en contacto preparado. No hay checkout, Stripe
ni confirmación automática de pagos.

| Botón | Pantalla | Qué hace | API real | Resultado |
| --- | --- | --- | --- | --- |
| Ver mi acceso | Inicio | Abre `Acceso`. | `GET /api/me` | Estado, renovación e invitación. |
| Solicitar acceso | Inicio / Acceso | Abre opciones de entrada o renovación. | Ninguna | Contexto preparado. |
| Enlace | Acceso | Carga el enlace de acceso usable y lo abre en Telegram. | `GET /api/invite` | Enlace abierto si está disponible. |
| Entrar / renovar | Acceso | Abre los planes para entrar, renovar o ampliar acceso. | Ninguna con `NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=false` | Mensaje preparado. |
| Catálogo privado | Inicio | Abre el catálogo del VIP privado. | Ninguna | Consultas bajo confirmación. |
| Hablar con Nina | Inicio | Abre contacto o lleva a `Contacto`. | Ninguna | Mensaje preparado o fallback copiable. |
| Problema con mi enlace | Acceso / Contacto | Prepara un mensaje con el problema de enlace. | Ninguna | Contacto abierto o preview local. |
| Preguntar por esta pieza | Catálogo privado | Prepara un mensaje específico del producto/categoría. | Ninguna | Contacto abierto o preview local. |
| Quiero entrar o renovar | Contacto | Prepara un mensaje de alta o renovación. | Ninguna | Contacto abierto o fallback copiable. |
| Copiar | Acceso / Contacto | Copia enlace o mensaje preparado. | Clipboard API | Texto copiado. |

## Feature Flags

- `NEXT_PUBLIC_ENABLE_PAYMENT_INTENTS=false`: no se muestran CTAs de aviso de pago ni la UI llama `POST /api/payments/intent`.
- `NEXT_PUBLIC_ENABLE_REFERRALS=false`: no aparece tab, card, CTA ni llamada UI de referidos. Aunque se active, Referidos no forma parte de la navegación principal.

Las APIs reales siguen validando Telegram `initData` en servidor. Ningún botón
usa `user_id` enviado por cliente como fuente de verdad.
