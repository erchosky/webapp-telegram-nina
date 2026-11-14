import { messagesFor, type TelegramMessageContext } from "./telegram/messages";
import { SUBSCRIPTION_STATUS } from "./statuses";
import { getEffectiveSubscriptionStatus } from "./services/subscription";

export type UserAccessStatus = "pending_validation" | "active" | "needs_manual_review" | "expired" | "cancelled";

export type SubscriptionAccess = { status: string; ends_at?: string | null } | null | undefined;

export function userAccessStatus(subscription: SubscriptionAccess, now = new Date()): UserAccessStatus {
  const status = getEffectiveSubscriptionStatus(subscription, now);
  if (!status || status === SUBSCRIPTION_STATUS.PENDING) return "pending_validation";
  if (status === SUBSCRIPTION_STATUS.NEEDS_MANUAL_REVIEW) return "needs_manual_review";
  if (status === SUBSCRIPTION_STATUS.CANCELLED) return "cancelled";
  if (status === SUBSCRIPTION_STATUS.ACTIVE) return "active";
  return "expired";
}

export function userAccessMessage(subscription: SubscriptionAccess, now = new Date(), context: TelegramMessageContext = {}, languageCode?: string | null) {
  const messages = messagesFor(languageCode);
  const status = userAccessStatus(subscription, now);
  if (status === "pending_validation") {
    return messages.startPending(context);
  }
  if (status === "active") {
    return messages.startActive({ ...context, fechaCaducidad: subscription?.ends_at ?? null });
  }
  if (status === "needs_manual_review") return messages.startPending(context);
  if (status === "expired") return messages.startExpired(context);
  return messages.startCancelled(context);
}
