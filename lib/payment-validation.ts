import { auditLog, botLog } from "@/lib/logs";
import { activateForDuration, activateForOneMonth, type ActivationDuration } from "@/lib/subscriptions";
import { createAdminClient } from "@/lib/supabase/admin";
import { rewardReferralIfEligible } from "./referrals";

type Subscription = Awaited<ReturnType<typeof activateForOneMonth>>;
type Dependencies = {
  activate: (userId: string) => Promise<Subscription>;
  deliverInvite: (userId: string, subscription: Subscription) => Promise<void>;
  audit: typeof auditLog;
  log: typeof botLog;
  rewardReferral?: typeof rewardReferralIfEligible;
  recordManualPayment?: typeof recordManualPaymentLedger;
};

const defaults = { activate: activateForOneMonth, audit: auditLog, log: botLog, rewardReferral: rewardReferralIfEligible, recordManualPayment: recordManualPaymentLedger };

function durationFields(duration: ActivationDuration) {
  if (duration.type === "months") return { duration_months: duration.months, duration_days: null };
  if (duration.type === "days") return { duration_months: null, duration_days: duration.days };
  const ms = duration.endsAt.getTime() - Date.now();
  return { duration_months: null, duration_days: Number.isFinite(ms) ? Math.max(1, Math.ceil(ms / 86_400_000)) : null };
}

async function recordManualPaymentLedger(input: { userId: string; subscription: Subscription; duration: ActivationDuration; note?: string | null }) {
  const { error } = await createAdminClient().from("manual_payments").insert({
    telegram_user_id: input.userId,
    vip_group_id: input.subscription.vip_group_id,
    ...durationFields(input.duration),
    notes: input.note ?? null,
    created_by_admin: "admin",
    status: "applied",
    applied_subscription_id: input.subscription.id
  });
  if (error) throw error;
}

export async function validatePaymentOneMonth(
  userId: string,
  deliverInvite: Dependencies["deliverInvite"],
  dependencies: Omit<Dependencies, "deliverInvite"> = defaults
) {
  const subscription = await dependencies.activate(userId);
  try {
    await dependencies.recordManualPayment?.({ userId, subscription, duration: { type: "months", months: 1 }, note: "Validación manual aprobada por admin" });
  } catch (error) {
    console.error("manual_payment_ledger_failed", error);
  }
  await dependencies.audit("manual_payment_validated", "Pago validado: acceso activado por 1 mes", userId, {
    starts_at: subscription.starts_at,
    ends_at: subscription.ends_at
  });
  await deliverInvite(userId, subscription);
  try {
    await dependencies.rewardReferral?.(userId);
  } catch (error) {
    console.error("referral_reward_failed", error);
  }
  await dependencies.log("manual_payment_validated", "Pago validado, suscripción activada y enlace enviado", {
    userId,
    groupId: subscription.vip_group_id,
    metadata: { ends_at: subscription.ends_at }
  });
  return subscription;
}

export async function validatePaymentDuration(
  userId: string,
  duration: ActivationDuration,
  deliverInvite: Dependencies["deliverInvite"],
  dependencies: Omit<Dependencies, "deliverInvite"> = { ...defaults, activate: (id) => activateForDuration(id, duration) }
) {
  const subscription = await dependencies.activate(userId);
  try {
    await dependencies.recordManualPayment?.({ userId, subscription, duration, note: "Validación manual aprobada por admin" });
  } catch (error) {
    console.error("manual_payment_ledger_failed", error);
  }
  await dependencies.audit("manual_payment_validated", "Pago validado: acceso activado con duración personalizada", userId, {
    starts_at: subscription.starts_at,
    ends_at: subscription.ends_at,
    duration
  });
  await deliverInvite(userId, subscription);
  try {
    await dependencies.rewardReferral?.(userId);
  } catch (error) {
    console.error("referral_reward_failed", error);
  }
  await dependencies.log("manual_payment_validated", "Pago validado, suscripción activada y enlace enviado", {
    userId,
    groupId: subscription.vip_group_id,
    metadata: { ends_at: subscription.ends_at, duration }
  });
  return subscription;
}

export const validatePayment30Days = validatePaymentOneMonth;
