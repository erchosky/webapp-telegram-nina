export const dashboardTexts = {
  appName: "Nina VIP",
  appTagline: "Mi archivo privado, bajo control",
  nav: {
    dashboard: "Resumen",
    users: "Usuarios",
    migration: "Migración inicial",
    subscriptions: "Suscripciones",
    logs: "Actividad",
    settings: "Configuración",
    logout: "Cerrar sesión"
  },
  pages: {
    dashboardTitle: "Todo bajo control",
    dashboardDescription: "Lo importante para controlar el VIP hoy.",
    usersTitle: "Usuarios",
    usersDescription: "Pendiente de validar significa que el usuario ya hizo /start, pero Nina todavía no ha confirmado su pago.",
    settingsTitle: "Configuración",
    settingsDescription: "Conecta el Telegram VIP y ajusta los mensajes que verá cada usuario.",
    loginTitle: "Panel privado",
    loginDescription: "Acceso privado de Nina."
  },
  labels: {
    memberSince: "Miembro desde",
    expiresAt: "Caduca",
    newExpiry: "Nueva caducidad",
    validatePayment: "Validar acceso 1 mes",
    renew: "Renovar acceso 1 mes",
    renewAndInvite: "Renovar acceso + enviar enlace",
    sendInvite: "Enviar enlace privado",
    retryInvite: "Reintentar enlace privado",
    kickNow: "Sacar del VIP",
    cancel: "Cancelar",
    unblock: "Desbloquear",
    operational: "Estado del acceso",
    process: "Procesando…"
  },
  accessStatus: {
    active: "Activo",
    pending: "Pendiente de validar",
    pending_validation: "Pendiente de validar",
    needs_manual_review: "Requiere revisión manual",
    expired: "Caducado",
    cancelled: "Cancelado",
    none: "Pendiente de validar"
  },
  subscriptionStatus: {
    pending: "Pendiente",
    active: "Activa",
    needs_manual_review: "Requiere revisión manual",
    expired: "Caducada",
    cancelled: "Cancelada"
  },
  expulsionStatus: {
    not_required: "No requerida",
    pending: "Pendiente",
    failed: "Fallida",
    unban_failed: "Desbloqueo fallido",
    succeeded: "Completada",
    resolved_manual: "Resuelta manualmente"
  },
  operationalStatus: {
    unknown: {
      label: "Sin estado operativo confirmado",
      description: "Todavía no tenemos una señal clara de invitación, entrada o salida.",
      tone: "neutral"
    },
    pending_validation: {
      label: "Pendiente de validar",
      description: "El usuario se registró, pero Nina todavía no ha validado el pago.",
      tone: "warning"
    },
    payment_validated: {
      label: "Pago validado",
      description: "El pago ya está validado y falta completar el acceso.",
      tone: "success"
    },
    invite_not_sent: {
      label: "Enlace no creado",
      description: "El acceso está validado, pero aún no se creó el enlace privado.",
      tone: "warning"
    },
    invite_sent_pending_join: {
      label: "Enlace enviado · pendiente de entrar",
      description: "El usuario recibió enlace; falta confirmar que entró al VIP.",
      tone: "warning"
    },
    invite_delivery_failed: {
      label: "Enlace no entregado",
      description: "Telegram no permitió enviar el enlace por privado.",
      tone: "danger"
    },
    retry_pending: {
      label: "Reintento pendiente",
      description: "Telegram limitó temporalmente el envío. Reintenta cuando pase la ventana indicada.",
      tone: "warning"
    },
    active_in_group: {
      label: "Activo · dentro del grupo",
      description: "El usuario tiene acceso vigente y está dentro del VIP.",
      tone: "success"
    },
    active_out_of_group: {
      label: "Activo · fuera del grupo",
      description: "El usuario tiene acceso vigente, pero no consta dentro del VIP.",
      tone: "warning"
    },
    expired_manual_review: {
      label: "Caducado · revisión manual",
      description: "El acceso caducó y requiere revisión antes de cerrar el caso.",
      tone: "warning"
    },
    expulsion_pending: {
      label: "Expulsión pendiente",
      description: "El acceso caducó y queda pendiente sacar al usuario del VIP.",
      tone: "warning"
    },
    expulsion_failed: {
      label: "Expulsión fallida",
      description: "Telegram rechazó la expulsión; requiere reintento o revisión manual.",
      tone: "danger"
    },
    unban_failed: {
      label: "Desbloqueo fallido",
      description: "El usuario fue expulsado pero podría seguir baneado. Revisión crítica.",
      tone: "danger"
    },
    bot_blocked: {
      label: "Bot bloqueado/no contactable",
      description: "El bot no puede escribir por privado a este usuario.",
      tone: "danger"
    },
    expelled: {
      label: "Expulsado",
      description: "El usuario fue sacado del VIP.",
      tone: "neutral"
    },
    resolved_manual: {
      label: "Resuelto manualmente",
      description: "Una incidencia fue revisada y cerrada manualmente.",
      tone: "success"
    }
  },
  incidents: {
    title: "Incidencias operativas",
    description: "Usuarios que necesitan revisión antes de dar el acceso por cerrado.",
    actionInvite: "Confirmar que abrió el bot y reenviar enlace privado.",
    actionExpulsion: "Reintentar expulsión/desbloqueo o resolver manualmente."
  },
  confirmations: {
    kick: (name: string) => `¿Sacar ahora a ${name} del VIP? Podrá volver si renuevas su acceso.`
  },
  errors: {
    inviteInactive: "No se puede enviar enlace: el usuario no tiene acceso activo y vigente. Renueva 1 mes para generar un nuevo enlace.",
    inviteDeliveryFailed: "No se pudo enviar el enlace. Revisa los logs de Telegram y reintenta.",
    paymentValidatedInviteFailed: "Pago validado, pero el enlace no se entregó. Revisa logs y reintenta cuando el usuario haya abierto el bot.",
    missingActiveGroup: "Configura primero el Telegram VIP activo antes de validar pagos, renovar o enviar enlaces.",
    telegramInvitePermission: "El bot debe ser administrador del grupo y tener permiso para crear enlaces de invitación.",
    telegramGroupChatIdInvalid: "Falta TELEGRAM_GROUP_CHAT_ID o no coincide con un grupo VIP activo. Revisa el Chat ID del grupo en configuración y en Vercel.",
    telegramRateLimited: "Telegram ha limitado temporalmente el envío. El pago/enlace queda pendiente de reintento; espera el retry_after indicado en la incidencia y pulsa “Reintentar enlace”.",
    inviteMarkFailed: "El enlace pudo haberse enviado, pero Supabase no lo marcó como enviado. Revisa los logs antes de reenviar para evitar duplicados.",
    manualExpelFailed: "No se pudo expulsar: Telegram rechazó la acción. Revisa que el bot sea admin y pueda restringir miembros.",
    manualExpelUnbanFailed: "Expulsión completada, pero falló el desbloqueo posterior. Incidencia crítica: pulsa “Intentar desbloquear”.",
    manualExpelUnbanStateFailed: "Expulsión ejecutada, falló el desbloqueo y además no se pudo guardar el estado. Revisa Telegram manualmente antes de repetir.",
    manualExpelStateFailed: "Telegram expulsó y desbloqueó, pero falló actualizar Supabase. Revisa logs y recarga antes de repetir.",
    manualExpelMissingGroup: "No hay grupo activo configurado para esta suscripción. Configura el grupo antes de expulsar.",
    manualExpelMissingSubscription: "El usuario no tiene suscripción actual. No se ejecutó expulsión.",
    manualExpelActiveConfirmationRequired: "Este usuario tiene acceso pagado activo. Para expulsarlo debes escribir EXPULSAR y confirmar el motivo.",
    manualExpelUnexpected: "Error controlado durante la expulsión. No debería haber pantalla 500; revisa los logs técnicos.",
    manualUnbanFailed: "Telegram rechazó el desbloqueo manual. Revisa permisos del bot o desbloquea desde Telegram.",
    manualUnbanMissingGroup: "No hay grupo activo configurado para desbloquear al usuario.",
    manualUnbanMissingSubscriptionGroup: "No se puede desbloquear: la suscripción no tiene grupo asociado.",
    alreadyActive: "El usuario ya tiene acceso activo. No se ha creado otro ni se ha cambiado la caducidad."
  }
} as const;

const actionLabels: Record<string, string> = {
  activate: "Activado 1 mes",
  renew: "Renovado 1 mes",
  manual_payment_validated: "Pago validado por Nina",
  manual_payment_recorded: "Pago registrado por Nina",
  migration_activate_exact_date: "Activado con fecha exacta",
  change_end: "Fecha de caducidad cambiada",
  quick_change_end: "Fecha cambiada con botón rápido",
  expired: "Marcado como caducado",
  cancelled: "Cancelado",
  pending: "Marcado como pendiente",
  invite_generated: "Enlace creado",
  invite_sent: "Enlace enviado",
  invite_send_failed: "Falló el envío del enlace",
  user_kicked_for_expiration: "Sacado automáticamente al caducar",
  user_unbanned_after_kick: "Desbloqueado después de sacarlo",
  user_renewed_after_expiration: "Acceso renovado después de caducar",
  internal_notes_changed: "Notas internas modificadas",
  tags_changed: "Etiquetas modificadas",
  manual_kick: "Sacado manualmente",
  manual_unban: "Desbloqueado manualmente",
  operational_incident: "Incidencia operativa",
  manual_payment: "Pago manual"
};

export function dashboardActionLabel(action?: string | null) {
  if (!action) return "Evento";
  return actionLabels[action] ?? action;
}

export function dashboardErrorMessage(code?: string | null) {
  const map: Record<string, string> = {
    invite_inactive: dashboardTexts.errors.inviteInactive,
    invite_delivery_failed: dashboardTexts.errors.inviteDeliveryFailed,
    payment_validated_invite_failed: dashboardTexts.errors.paymentValidatedInviteFailed,
    missing_active_group: dashboardTexts.errors.missingActiveGroup,
    telegram_invite_permission: dashboardTexts.errors.telegramInvitePermission,
    telegram_group_chat_id_invalid: dashboardTexts.errors.telegramGroupChatIdInvalid,
    telegram_rate_limited: dashboardTexts.errors.telegramRateLimited,
    invite_mark_failed: dashboardTexts.errors.inviteMarkFailed,
    manual_expel_failed: dashboardTexts.errors.manualExpelFailed,
    manual_expel_unban_failed: dashboardTexts.errors.manualExpelUnbanFailed,
    manual_expel_unban_state_failed: dashboardTexts.errors.manualExpelUnbanStateFailed,
    manual_expel_state_failed: dashboardTexts.errors.manualExpelStateFailed,
    manual_expel_missing_group: dashboardTexts.errors.manualExpelMissingGroup,
    manual_expel_missing_subscription: dashboardTexts.errors.manualExpelMissingSubscription,
    manual_expel_active_confirmation_required: dashboardTexts.errors.manualExpelActiveConfirmationRequired,
    manual_expel_unexpected: dashboardTexts.errors.manualExpelUnexpected,
    manual_unban_failed: dashboardTexts.errors.manualUnbanFailed,
    manual_unban_missing_group: dashboardTexts.errors.manualUnbanMissingGroup,
    manual_unban_missing_subscription_group: dashboardTexts.errors.manualUnbanMissingSubscriptionGroup,
    already_active: dashboardTexts.errors.alreadyActive
  };
  return code ? map[code] ?? null : null;
}

type Tone = "neutral" | "accent" | "success" | "danger" | "warning";

export function accessStatusLabel(status?: string | null) {
  const value = status ?? "none";
  return dashboardTexts.accessStatus[value as keyof typeof dashboardTexts.accessStatus] ?? value;
}

export function accessStatusTone(status?: string | null): Tone {
  const value = status ?? "none";
  if (value === "active") return "success";
  if (value === "pending" || value === "pending_validation" || value === "needs_manual_review") return "warning";
  if (value === "expired") return "danger";
  return "neutral";
}

export function subscriptionStatusLabel(status?: string | null) {
  const value = status || "pending";
  return dashboardTexts.subscriptionStatus[value as keyof typeof dashboardTexts.subscriptionStatus] ?? value;
}

export function expulsionStatusLabel(status?: string | null) {
  const value = status || "not_required";
  return dashboardTexts.expulsionStatus[value as keyof typeof dashboardTexts.expulsionStatus] ?? value;
}

export function operationalStatusInfo(status?: string | null) {
  const value = status || "unknown";
  return dashboardTexts.operationalStatus[value as keyof typeof dashboardTexts.operationalStatus] ?? dashboardTexts.operationalStatus.unknown;
}

export function operationalStatusLabel(status?: string | null) {
  return operationalStatusInfo(status).label;
}

export function operationalStatusDescription(status?: string | null) {
  return operationalStatusInfo(status).description;
}

export function operationalStatusTone(status?: string | null): Tone {
  return operationalStatusInfo(status).tone as Tone;
}
