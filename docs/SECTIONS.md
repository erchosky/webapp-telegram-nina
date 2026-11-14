# Sections

La navegación final de la MiniApp es:

- Inicio
- Acceso
- Catálogo privado
- Contacto

## Inicio

Entrada simple al espacio privado:

- Saludo personalizado.
- Estado resumido.
- CTA principal inteligente.
- Pregunta principal: "¿Qué quieres hacer?"
- Acciones: entrar o renovar, ver catálogo, preguntar por una pieza y reportar
  un problema.

No muestra novedades inventadas.

## Acceso

Lugar único para estado, renovación e invitación:

- Mi estado.
- Entrar / renovar.
- Enlace.
- Problema con mi enlace.

La invitación no es un referido. Es el enlace de acceso para entrar al grupo
privado cuando el acceso está activo.

## Catálogo privado

Escaparate visible para todos. Solo se muestran productos confirmados. Los
productos con `status="hidden"` o `status="archived"` quedan ocultos hasta tener
contenido real validado por Nina.

## Contacto

Asistente de mensajes preparados:

- Acceso o renovación.
- Me interesa algo del catálogo.
- Tengo problema con mi enlace.
- Necesito ayuda con otra cosa.

Incluye como bloque secundario datos básicos, normas y privacidad. No hay tab
principal de Cuenta.

## Legacy

`AccessScreen` vuelve a estar montada como tab principal y agrupa `StatusScreen`,
`RenewScreen` e `InviteScreen`. `ContactScreen` vuelve a ser tab principal.
`AccountScreen`, `HelpScreen` y `ReferralsScreen` fueron eliminadas de la
experiencia visible. Los servicios/APIs de referidos permanecen detrás de
`NEXT_PUBLIC_ENABLE_REFERRALS=false`.
