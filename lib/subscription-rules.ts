import { addNaturalMonths } from "./subscription-dates";
import { SUBSCRIPTION_STATUS } from "./statuses";
import { getEffectiveSubscriptionStatus } from "./services/subscription";

export type WarningKind = "72h" | "24h" | "1h";
export function renewalEnd(now: Date, status?: string | null, endsAt?: string | null) {
  const end = endsAt ? new Date(endsAt) : null;
  const base = status === SUBSCRIPTION_STATUS.ACTIVE && end && end > now ? end : now;
  return addNaturalMonths(base, 1);
}
export function dueWarning(now: Date, endsAt: Date, warned: Partial<Record<WarningKind, unknown>>): WarningKind | null {
  const hours = (endsAt.getTime() - now.getTime()) / 3_600_000;
  if (hours <= 0) return null;
  if (hours <= 1) return warned["1h"] ? null : "1h";
  if (hours <= 24) return warned["24h"] ? null : "24h";
  if (hours <= 72) return warned["72h"] ? null : "72h";
  return null;
}
export const isExpired = (now: Date, endsAt: Date) => endsAt <= now;
export function renewalNeedsInvite(now: Date, status?: string | null, endsAt?: string | null) {
  return getEffectiveSubscriptionStatus(status ? { status, ends_at: endsAt ?? null } : null, now) !== SUBSCRIPTION_STATUS.ACTIVE;
}

export type InviteableSubscription = { status?: string | null; ends_at?: string | null } | null | undefined;

export function isCurrentActive(subscription: InviteableSubscription, now = new Date()) {
  return getEffectiveSubscriptionStatus(subscription?.status ? { status: subscription.status, ends_at: subscription.ends_at ?? null } : null, now) === SUBSCRIPTION_STATUS.ACTIVE;
}

export const canSendInvite = isCurrentActive;

export function sendInviteRejectionMessage(subscription: InviteableSubscription, now = new Date()) {
  if (canSendInvite(subscription, now)) return null;
  if (!subscription) return "No se puede enviar enlace: el usuario no tiene una suscripción activa.";
  if (subscription.status === SUBSCRIPTION_STATUS.EXPIRED) return "No se puede enviar enlace: la suscripción está caducada. Renueva 1 mes para enviar un nuevo enlace.";
  if (subscription.status === SUBSCRIPTION_STATUS.CANCELLED) return "No se puede enviar enlace: la suscripción está cancelada. Renueva 1 mes para enviar un nuevo enlace.";
  if (subscription.status === SUBSCRIPTION_STATUS.PENDING) return "No se puede enviar enlace: el pago todavía está pendiente de validar.";
  if (subscription.status === SUBSCRIPTION_STATUS.NEEDS_MANUAL_REVIEW) return "No se puede enviar enlace: este miembro migrado necesita revisión manual de caducidad.";
  return "No se puede enviar enlace: la suscripción no está activa o ya ha caducado.";
}
