# Revisión de rendimiento — 2026-07

## Evidencia de build

Se ejecutó `npm run build` con Next 15.5.19. El resultado relevante fue:

| Área | Resultado |
| --- | ---: |
| JavaScript compartido inicial | 102 kB |
| `/` y rutas `/dev` | 136 kB First Load JS |
| páginas admin normales | 106–114 kB First Load JS |
| detalle admin de usuario | 116 kB First Load JS |
| middleware | 34,4 kB |

No hay una medición histórica de bundle comparable. Por ello no se afirma una
reducción de First Load JS; los cambios aplicados reducen bytes y trabajo de
base de datos en el catálogo y exportación, no el bundle cliente.

## Revisión y decisiones

| Comprobación | Archivo | Evidencia | Impacto estimado | Resultado |
| --- | --- | --- | --- | --- |
| Imágenes ajenas cargadas | `lib/marketplace/server.ts` | La consulta pedía hasta 500 imágenes sin restringirlas a los ítems del catálogo | Medio con catálogos grandes: bytes y transferencia innecesarios | Corregido: tras cargar ítems publicados, consulta imágenes con `in(item_id, ids)`; hay índice por `item_id`. |
| Exportación con columnas sobrantes | `app/api/admin/users/export/route.ts` | `select("*, subscriptions(*)")` recuperaba más datos que el CSV utiliza | Bajo/medio según volumen; reduce PII en memoria | Corregido con proyección explícita. La exportación sigue sin paginar por ser descarga administrativa completa. |
| Consultas paralelas | catálogo, dashboard y páginas admin | Usan `Promise.all` cuando las consultas son independientes | Medio en latencia | Ya correcto. Las imágenes quedan después de ítems porque requieren sus IDs. |
| N+1 y paginación | catálogos y listados admin | Relaciones se resuelven por join/mapa; listas grandes usan límites y `range` | Bajo/medio | Ya correcto. |
| `select("*")` restante | servicios bot/admin internos | Quedan filas completas para flujos internos y mutaciones | Bajo/medio, sólo servidor | No se hace refactor masivo; sustituir incrementalmente al modificar cada flujo. |
| Índices | `supabase/migrations/*.sql` | Hay índices para identidad, suscripciones, expiración, logs, intereses, catálogo e imágenes | Medio | No se añade índice sin `EXPLAIN ANALYZE`. La búsqueda `%texto%` puede requerir `pg_trgm` si staging revela lentitud. |
| Caché y dinamismo | rutas API/admin | Datos privados usan `no-store`; admin depende de cookies y sesiones | Correctitud | No se cambia. La caché de catálogo requeriría invalidación verificable tras Actions. |
| Client Components | `components/AppShell.tsx` y pantallas | Shell usa estado, SDK Telegram, fetch, clipboard y hápticos | Bajo beneficio aislado | No se convierten sin rediseño. Fetches se abortan y listeners se limpian. |
| Recursos móvil/WebView | layout y provider | SDK oficial, `safe-area-inset-bottom`, viewport `cover`, iconos nombrados; no Realtime | Medio UX | Sin medición Telegram real. Validar Web Vitals en staging. |

## Límites de medición

No hay base Supabase ni dispositivo Telegram disponibles. No se pudieron
ejecutar `EXPLAIN ANALYZE`, Lighthouse autenticado o Web Vitals reales. El
build e inspección estática verifican tamaños, rutas y estructura, no latencia
de red real.
