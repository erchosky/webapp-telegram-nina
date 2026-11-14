import type { SubscriptionRow, SubscriptionStatus } from "@/lib/domain/types";
import { getEffectiveSubscriptionStatus } from "@/lib/services/subscription";

/** Lower number = higher priority when picking the "current" subscription. */
const STATUS_PRIORITY: Record<SubscriptionStatus, number> = {
  active: 0,
  needs_manual_review: 1,
  pending: 2,
  expired: 3,
  cancelled: 4,
};

/**
 * Pick the subscription that best represents the user's current state:
 * by status priority (active first), then the one ending latest, then newest.
 * Pure function so it can be unit-tested without a database.
 */
export function selectCurrentSubscription(
  subscriptions: SubscriptionRow[],
  now: Date = new Date(),
): SubscriptionRow | null {
  if (subscriptions.length === 0) return null;
  return [...subscriptions].sort((a, b) => compare(a, b, now))[0];
}

function compare(a: SubscriptionRow, b: SubscriptionRow, now: Date): number {
  const statusA = getEffectiveSubscriptionStatus(a, now) ?? a.status;
  const statusB = getEffectiveSubscriptionStatus(b, now) ?? b.status;
  const byStatus = (STATUS_PRIORITY[statusA] ?? 99) - (STATUS_PRIORITY[statusB] ?? 99);
  if (byStatus !== 0) return byStatus;

  const endsA = time(a.ends_at);
  const endsB = time(b.ends_at);
  if (endsA !== endsB) return endsB - endsA;

  return time(b.created_at) - time(a.created_at);
}

function time(iso: string | null): number {
  if (!iso) return -Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}
