# Modelo de seguridad `service_role`

## Límite de confianza

`lib/supabase/admin.ts` es el único constructor del cliente con
`SUPABASE_SERVICE_ROLE_KEY`. Está marcado con `server-only`, desactiva la
persistencia/refresco de sesión y no se importa desde Client Components. La
prueba `test/service-role-boundaries.test.ts` evita regresiones de importación
directa, nombres de secretos y rutas públicas sin `withAuth`.

La clave no se publica como `NEXT_PUBLIC_*`; Next no puede incluir un módulo
`server-only` en el bundle cliente. El build de producción también verifica ese
límite de módulos.

## Autorización antes del acceso privilegiado

| Superficie | Control previo | Uso de service role |
| --- | --- | --- |
| API de usuario | `withAuth` valida firma y frescura de Telegram `initData` | Las consultas usan `ctx.user` derivado del usuario autenticado. |
| Administración | middleware, sesión firmada/revocable; Actions con `requireAdmin`, origen y rate limit | Operaciones de soporte/administración. |
| Webhook Telegram | secreto de cabecera, validación de payload y deduplicación | Procesa sólo actualizaciones autenticadas. |
| Cron | Bearer `CRON_SECRET`, comparación segura y rate limit | Expiraciones y tareas de sistema. |
| Bot/tareas internas | no son endpoints HTTP públicos | Operaciones de bot, logs y suscripciones. |

Los IDs de MiniApp no provienen del cliente: `authenticate` resuelve el usuario
desde `initData` y los servicios de interés, invite y pago filtran por ese ID.
El test de interés confirma que el cuerpo no puede sustituir la identidad
escrita. Los IDs administrativos sólo se aceptan tras `requireAdmin` y
validación de formularios.

## RLS frente a protección de servidor

RLS está habilitada en las tablas de las migraciones y `anon`/`authenticated`
no tienen grants ni políticas: bloquea accesos directos de clientes Supabase.
`service_role` **bypassa RLS**; por tanto, propiedad, roles y alcance dependen
de rutas, Server Actions y servicios del servidor. RLS reduce la superficie,
pero no corrige un handler que use `service_role` sin autorización.

## Realtime, Storage y funciones de cliente

No hay cliente Supabase, suscripciones Realtime ni subida de archivos en el
navegador. Las imágenes son URLs públicas o rutas existentes de un bucket
público; el dashboard sube imágenes mediante una Server Action validada que usa
`service_role` exclusivamente en servidor. No se necesita acceso directo de
cliente a Supabase. Si se añade Storage, Realtime o Edge Functions, deberá usar
credenciales anon de alcance mínimo y políticas RLS/Storage específicas; nunca
la clave de servicio.
