import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "./supabase/admin";
import { auditLog, botLog } from "./logs";
import { getBotInfo } from "./telegram/api";
import { SUBSCRIPTION_STATUS } from "./statuses";
import { ENABLE_REFERRALS } from "./config/features";

type AdminClient = ReturnType<typeof createAdminClient>;

export const REFERRAL_REWARD_DAYS = 5;

function newCode() {
  return randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12);
}

function uniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

export async function getOrCreateReferralCode(internalUserId: string, db: AdminClient = createAdminClient()) {
  if (!ENABLE_REFERRALS) throw new Error("Los referidos no están activos ahora.");
  const existing = await db.from("referral_codes").select("*").eq("telegram_user_id", internalUserId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db.from("referral_codes").insert({
      telegram_user_id: internalUserId,
      code: newCode()
    }).select().single();
    if (!error && data) return data;
    if (!uniqueViolation(error)) throw error;
  }
  throw new Error("No se pudo generar un código de referido único.");
}

export async function referralLinkForUser(internalUserId: string, db: AdminClient = createAdminClient()) {
  const [code, botInfo] = await Promise.all([getOrCreateReferralCode(internalUserId, db), getBotInfo()]);
  if (!botInfo.username) throw new Error("El bot no tiene username público para generar enlace de referido.");
  return `https://t.me/${botInfo.username}?start=ref_${code.code}`;
}

export async function recordReferralStart(referredInternalUserId: string, referralCode: string, db: AdminClient = createAdminClient()) {
  if (!ENABLE_REFERRALS) return { recorded: false, reason: "referrals_disabled" as const };
  const normalized = referralCode.replace(/^ref_/i, "").trim();
  if (!normalized) return { recorded: false, reason: "empty_code" as const };
  const { data: code, error } = await db.from("referral_codes").select("*").eq("code", normalized).maybeSingle();
  if (error) throw error;
  if (!code) return { recorded: false, reason: "unknown_code" as const };
  if (code.telegram_user_id === referredInternalUserId) return { recorded: false, reason: "self_referral" as const };

  const { error: insertError } = await db.from("referral_attributions").insert({
    referrer_user_id: code.telegram_user_id,
    referred_user_id: referredInternalUserId,
    referral_code_id: code.id
  });
  if (insertError) {
    if (uniqueViolation(insertError)) return { recorded: false, reason: "already_attributed" as const };
    throw insertError;
  }
  await botLog("referral_attributed", "Usuario registrado con enlace de referido", {
    userId: referredInternalUserId,
    metadata: { referrer_user_id: code.telegram_user_id, referral_code_id: code.id }
  });
  return { recorded: true as const, referrerUserId: code.telegram_user_id as string };
}

export async function rewardReferralIfEligible(referredInternalUserId: string, db: AdminClient = createAdminClient(), now = new Date()) {
  if (!ENABLE_REFERRALS) return { rewarded: false, reason: "referrals_disabled" as const };
  const { data: attribution, error } = await db
    .from("referral_attributions")
    .select("*")
    .eq("referred_user_id", referredInternalUserId)
    .maybeSingle();
  if (error) throw error;
  if (!attribution) return { rewarded: false, reason: "no_attribution" as const };

  const existingReward = await db.from("referral_rewards").select("*").eq("attribution_id", attribution.id).maybeSingle();
  if (existingReward.error) throw existingReward.error;
  if (existingReward.data?.status === "applied") return { rewarded: false, reason: "already_rewarded" as const };

  let reward = existingReward.data;
  if (!reward) {
    const insert = await db.from("referral_rewards").insert({
      attribution_id: attribution.id,
      referrer_user_id: attribution.referrer_user_id,
      referred_user_id: attribution.referred_user_id,
      reward_days: REFERRAL_REWARD_DAYS,
      status: "pending"
    }).select().single();
    if (insert.error) {
      if (uniqueViolation(insert.error)) return { rewarded: false, reason: "already_rewarded" as const };
      throw insert.error;
    }
    reward = insert.data;
  }

  const { data: referrerSubscription, error: subError } = await db
    .from("subscriptions")
    .select("*")
    .eq("telegram_user_id", attribution.referrer_user_id)
    .eq("status", SUBSCRIPTION_STATUS.ACTIVE)
    .gt("ends_at", now.toISOString())
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subError) throw subError;

  if (!referrerSubscription?.ends_at) {
    await db.from("referral_rewards").update({
      status: "skipped",
      skipped_reason: "referrer_without_active_subscription"
    }).eq("id", reward.id);
    return { rewarded: false, reason: "referrer_without_active_subscription" as const };
  }

  const newEndsAt = new Date(new Date(referrerSubscription.ends_at).getTime() + REFERRAL_REWARD_DAYS * 86_400_000);
  const update = await db.from("subscriptions").update({
    ends_at: newEndsAt.toISOString(),
    warned_48h_at: null,
    warned_72h_at: null,
    warned_24h_at: null,
    warned_1h_at: null
  }).eq("id", referrerSubscription.id);
  if (update.error) throw update.error;

  const rewardUpdate = await db.from("referral_rewards").update({
    status: "applied",
    rewarded_subscription_id: referrerSubscription.id,
    applied_at: now.toISOString()
  }).eq("id", reward.id);
  if (rewardUpdate.error) throw rewardUpdate.error;

  await auditLog("referral_reward_applied", "Recompensa de referido aplicada: +5 días", attribution.referrer_user_id, {
    referred_user_id: referredInternalUserId,
    subscription_id: referrerSubscription.id,
    previous_ends_at: referrerSubscription.ends_at,
    new_ends_at: newEndsAt.toISOString()
  });
  await botLog("referral_reward_applied", "Recompensa de referido aplicada", {
    userId: attribution.referrer_user_id,
    metadata: { referred_user_id: referredInternalUserId, reward_days: REFERRAL_REWARD_DAYS }
  });

  return { rewarded: true as const, referrerUserId: attribution.referrer_user_id as string, newEndsAt };
}
