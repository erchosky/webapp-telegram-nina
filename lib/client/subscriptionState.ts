import type { MeDTO } from "@/lib/api/dto";
import { ENABLE_PAYMENT_INTENTS } from "@/lib/config/features";

export type AccessState = "pending" | "active" | "expired" | "none";

export function getAccessState(me: MeDTO, now: Date = new Date()): AccessState {
  const sub = me.subscription;
  if (
    sub?.status === "needs_manual_review" ||
    sub?.status === "pending" ||
    (ENABLE_PAYMENT_INTENTS && me.hasOpenPaymentIntent)
  ) {
    return "pending";
  }
  if (!sub) return "none";
  if (sub.status === "expired") return "expired";
  if (sub.status === "cancelled" || sub.status !== "active") return "none";
  return isFutureOrOpenEnded(sub.endsAt, now) ? "active" : "expired";
}

function isFutureOrOpenEnded(endsAt: string | null, now: Date): boolean {
  if (!endsAt) return true;
  const timestamp = new Date(endsAt).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}
