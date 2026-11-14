import "server-only";
import type { AuthContext } from "@/lib/telegram/auth";
import type { ReferralsDTO } from "@/lib/api/dto";
import type { ReferralCodeRow, ReferralRewardRow } from "@/lib/domain/types";
import { ServiceError } from "@/lib/api/respond";
import { generateReferralCode } from "@/lib/services/generateCode";

const MAX_CODE_ATTEMPTS = 5;

export async function getReferrals(ctx: AuthContext): Promise<ReferralsDTO> {
  const { supabase, user } = ctx;

  const code = await fetchCode(ctx);

  const { count, error: countError } = await supabase
    .from("referral_attributions")
    .select("id", { count: "exact", head: true })
    .eq("referrer_user_id", user.id);
  if (countError) {
    throw new ServiceError(500, "db_error", countError.message, {
      context: { service: "referrals.getReferrals.count" },
    });
  }

  const { data: rewardsData, error: rewardsError } = await supabase
    .from("referral_rewards")
    .select("reward_days, status")
    .eq("referrer_user_id", user.id);
  if (rewardsError) {
    throw new ServiceError(500, "db_error", rewardsError.message, {
      context: { service: "referrals.getReferrals.rewards" },
    });
  }

  const rewards = ((rewardsData ?? []) as unknown as Pick<ReferralRewardRow, "reward_days" | "status">[]).map(
    (r) => ({ rewardDays: r.reward_days, status: r.status }),
  );

  return { code, invitedCount: count ?? 0, rewards };
}

/**
 * Return the user's referral code, creating one on first request. Idempotent:
 * never creates a second code for a user (telegram_user_id is UNIQUE).
 */
export async function ensureReferralCode(ctx: AuthContext): Promise<string> {
  const existing = await fetchCode(ctx);
  if (existing) return existing;

  const { supabase, user } = ctx;

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const candidate = generateReferralCode();
    const { data, error } = await supabase
      .from("referral_codes")
      .insert({ telegram_user_id: user.id, code: candidate })
      .select("id, telegram_user_id, code")
      .single();

    if (!error) {
      return (data as unknown as ReferralCodeRow).code;
    }

    if (error.code === "23505") {
      // Unique violation: either this user already has a code (race) or the
      // generated code collided. Re-check the user's code; if present, use it.
      const raced = await fetchCode(ctx);
      if (raced) return raced;
      // Otherwise it was a code collision — retry with a fresh candidate.
      continue;
    }

    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "referrals.ensureReferralCode", code: error.code },
    });
  }

  throw new ServiceError(
    500,
    "code_generation_failed",
    "Could not allocate a referral code",
  );
}

async function fetchCode(ctx: AuthContext): Promise<string | null> {
  const { supabase, user } = ctx;
  const { data, error } = await supabase
    .from("referral_codes")
    .select("id, telegram_user_id, code")
    .eq("telegram_user_id", user.id)
    .maybeSingle();
  if (error) {
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "referrals.fetchCode" },
    });
  }
  return (data as unknown as ReferralCodeRow | null)?.code ?? null;
}
