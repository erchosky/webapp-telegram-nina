# Future Referrals

La MiniApp no muestra una sección de referidos por ahora.

## Decisión actual

- Invitación y referido son conceptos distintos.
- Invitación: enlace de acceso para que un usuario con acceso activo entre al grupo privado.
- Referido: recomendación de otra persona, potencialmente asociada a una recompensa.
- El pago sigue siendo manual y la creadora/admin verifica por captura o por el canal operativo que corresponda.
- No se muestran códigos, recompensas, botones de compartir ni mensajes tipo "invita a un amigo".

La flag pública queda apagada por defecto:

```env
NEXT_PUBLIC_ENABLE_REFERRALS=false
```

Con la flag en `false`, la MiniApp no debe mostrar el módulo de referidos, no debe mostrar botones de referidos y no debe llamar APIs de referidos desde la experiencia de usuario.

## Flujo futuro propuesto

1. Usuario A recibe un código de recomendación.
2. Usuario B contacta con la creadora/admin usando ese código.
3. El mensaje preparado incluye: `Vengo recomendado por: CODIGO`.
4. La creadora/admin confirma manualmente el pago.
5. El sistema interno asigna la recompensa a Usuario A si corresponde.

## Condiciones antes de activarlo

- Definir exactamente qué cuenta como referido válido.
- Definir si hay recompensa, cuál es y cuándo se aplica.
- Definir cómo se evitan duplicados o abuso.
- Definir cómo se comunica el estado sin prometer recompensas automáticas.
- Añadir tests de UI con `NEXT_PUBLIC_ENABLE_REFERRALS=true` y `false`.
