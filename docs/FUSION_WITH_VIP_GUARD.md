# Documento histórico: Fusion With VIP Guard

> **Estado:** histórico, no normativo. La fusión modular ya está implementada. La arquitectura oficial vigente está en `README.md` y `docs/FUSION_ARCHITECTURE.md`.

La indicación original era “no fusionar todavía”; se conserva solo como contexto de decisión previa.

La WebApp es la parte pública/cliente. VIP Guard es el sistema operativo. La
separación completa está en `docs/FUTURE_INTEGRATION.md`. La matriz de
ownership está en `docs/VIP_GUARD_MINIAPP_ARCHITECTURE.md`.

Antes de cualquier fusión:

- mantener la navegación visible: Inicio, Acceso, Catálogo y Contacto;
- mantener Catálogo separado de planes de acceso;
- mantener invitación y referido como conceptos distintos;
- mantener referidos apagados hasta cerrar el contrato completo;
- mantener payment intents apagado mientras el flujo real termine en contacto
  manual;
- mover marketplace/productos/textos visibles a configuración administrable;
- revisar migraciones Supabase en staging;
- no cambiar nombres de tablas ni estados sin migración explícita.
