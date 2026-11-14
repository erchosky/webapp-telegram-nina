import type { SubscriptionRow, SubscriptionStatus } from "@/lib/domain/types";

export type EffectiveSubscriptionInput =
  | { status: SubscriptionStatus | string; ends_at?: string | null }
  | null
  | undefined;

export function isActiveSubscription(
  subscription: EffectiveSubscriptionInput,
  now: Date = new Date(),
): subscription is SubscriptionRow {
  return getEffectiveSubscriptionStatus(subscription, now) === "active";
}

export function getEffectiveSubscriptionStatus(
  subscription: EffectiveSubscriptionInput,
  now: Date = new Date(),
): SubscriptionStatus | null {
  if (!subscription) return null;
  if (subscription.status !== "active") return subscription.status as SubscriptionStatus;
  if (!subscription.ends_at) return "active";
  const endsAt = new Date(subscription.ends_at).getTime();
  return Number.isFinite(endsAt) && endsAt > now.getTime() ? "active" : "expired";
}
