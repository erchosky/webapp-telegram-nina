# Backup y restauración

## Alcance

La operación diaria del producto no requiere SQL ni terminal. Backup y restore sí
son operaciones de infraestructura sensible y deben ejecutarse con una cuenta
Supabase autorizada, idealmente por una segunda persona técnica y primero en
staging.

## Base de datos

1. Activa los backups administrados y Point-in-Time Recovery disponibles para el
   plan del proyecto Supabase.
2. Antes de una migración o cambio masivo, crea/confirma un backup reciente desde
   el panel de Supabase.
3. Registra fecha, responsable, proyecto y motivo en el registro operativo.
4. Para restaurar, usa un proyecto de staging nuevo o el procedimiento de restore
   del proveedor. Nunca ensayes por primera vez sobre producción.
5. Tras restaurar, ejecuta `test:db`, verifica usuarios/suscripciones, catálogo e
   intereses, y solo después reconecta el bot de staging.

## Storage

El bucket público `creator-assets` forma parte del backup de producto. Exporta o
replica sus objetos junto con la base de datos; las filas guardan `storage_path` y
no sustituyen al archivo binario. Comprueba una muestra de URLs después del
restore.

El botón “Limpiar imágenes huérfanas” de `/admin/webapp` solo elimina rutas con el
prefijo propiedad del CMS y que no aparecen en categorías, galería o branding.
Úsalo después de confirmar el backup. No sustituye una política de retención.

## Ensayo mínimo trimestral

- restaurar base y Storage en staging aislado;
- confirmar login admin y sesión revocable;
- abrir una ficha VIP y una suscripción;
- leer catálogo e imagen;
- crear un interés y comprobar su categoría histórica;
- ejecutar cron con Telegram de staging;
- documentar duración, errores y responsable.

Secretos, tokens del bot y variables de Vercel no se guardan en las tablas ni en
el ZIP: deben recuperarse desde el gestor de secretos autorizado.
