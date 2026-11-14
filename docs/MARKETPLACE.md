# Catálogo

Catálogo es un escaparate puntual del espacio privado. No repite planes de
acceso y no procesa pagos.

El catálogo de producción debe alimentarse desde base de datos/CMS interno,
gestionado por el Dashboard MiniApp. El contrato de tablas está en
`supabase/migrations/20260626000004_webapp_marketplace.sql`.

`lib/marketplace/catalog.ts` solo contiene tipos y fixtures locales opt-in. No
debe ser la fuente de productos de producción.

La intención manual de interés se registra con `POST /api/marketplace/interest`
en `purchase_interests`. No representa checkout, no confirma pago y no activa
entrega automática. La base limita una solicitud abierta por usuario/producto.

La MiniApp ofrece una apertura explícita de detalle con descripción, imagen,
precio/etiqueta, condiciones visibles y CTA. Las categorías admiten imagen
pública. La personalización controlada se gestiona en `/admin/webapp/home` y
`/admin/webapp/branding`, sin editar JSON libre.

Cada interés guarda `item_id` y una instantánea `category_id`; así, mover o
archivar el artículo no altera la categoría histórica de la solicitud.

El CMS permite selección de archivo y arrastrar/soltar. El navegador valida y
optimiza a WebP (máximo 1600 px por lado) antes de enviar; el servidor vuelve a
validar firma, MIME, extensión, tamaño y dimensiones antes de guardar en el
bucket `creator-assets`. Categorías y productos pueden sustituir la imagen;
productos mantienen imagen principal y galería. Los archivos anteriores se
retiran de forma segura cuando pertenecen al prefijo del CMS y existe una
limpieza explícita de huérfanos en `/admin/webapp`.

## Categorías

- Contenido online
- Personalizados
- Piezas bajo consulta
- Wishlist / regalos

No se muestran promociones si no hay una promoción real configurada.

## Productos

Cada producto define:

- `id`
- `title`
- `description`
- `categoryId`
- `imageUrl`
- `imageAlt`
- `priceAmount`
- `currency`
- `priceLabel`
- `status`
- `isPublished`
- `soldAt`
- `soldVisibilityUntil`
- `isFeatured`
- `sortOrder`
- `kind`
- `deliveryType`
- `requiresActiveAccess`
- `ctaLabel`
- `contactIntent`

Producción:

- no debe depender de productos hardcodeados;
- debe leer `marketplace_categories`, `marketplace_items` y `marketplace_item_images`
  desde API server-side;
- debe mostrar productos `available` / `reserved`;
- debe mostrar productos `sold` solo hasta `sold_visibility_until`;
- debe ocultar `hidden` y `archived`.

Fixtures locales opt-in:

Para pruebas de UI sin CMS se puede activar:

```env
NEXT_PUBLIC_ENABLE_MARKETPLACE_FIXTURES=true
```

Fixtures incluidos:

- Contenido online bajo consulta: `consultar`.
- Pack personalizado: precio demo alineado con la fuente única de planes/config local.
- Wishlist / regalos: `consultar`.

Productos de ejemplo/no confirmados:

- Calcetines Spider-Man.
- Zapatillas New Balance.

Estos ejemplos quedan con `isPublished=false` y `status="hidden"` hasta que Nina
confirme producto, precio, estado e imágenes reales. No deben salir en
producción como disponibles.

Los items con `isPublished=false`, `status="hidden"` o `status="archived"` no
aparecen por defecto.

## Imágenes

Las imágenes públicas de producción deben registrarse en `marketplace_item_images`
y servirse desde Supabase Storage `creator-assets`. Si falta la imagen o el
producto no define media, la UI muestra un placeholder con icono y categoría.

## Mensajes Preparados

Los mensajes se generan en `lib/messages/catalog.ts`.

Incluyen intención, producto, categoría, precio mostrado, usuario de Telegram,
referencia Telegram y estado de acceso cuando aplica. Nunca se pide el ID al
usuario.

## Reglas

- Catálogo es visible para todos, sin exigir VIP activo.
- No se usa la palabra comprar porque no hay checkout real.
- Contenido o acceso privado puede marcarse con `requiresActiveAccess`.
- Toda consulta termina en mensaje preparado.
- No hay Stripe, checkout ni pagos automáticos.
- "Me interesa" y CTAs equivalentes deben terminar en contacto/intención manual.
- El Dashboard MiniApp no activa suscripciones, no valida pagos y no genera
  invitaciones.
