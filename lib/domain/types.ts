/**
 * Domain row shapes for the VIP Guard tables this Mini App touches.
 *
 * These mirror the REAL `public` schema of VIP Guard. They are intentionally
 * partial (only the columns we read/write) but names and types match exactly so
 * the merge into VIP Guard is trivial. Do NOT rename anything here.
 */

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "needs_manual_review"
  | "expired"
  | "cancelled";

export type ManualPaymentStatus = "recorded" | "applied" | "cancelled";

export type ReferralRewardStatus = "pending" | "applied" | "skipped";

/** Status of a Mini App payment intent (new additive table — see supabase/). */
export type PaymentIntentStatus = "requested" | "seen" | "resolved" | "cancelled";

export interface TelegramUserRow {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  first_seen_at: string | null;
  started_bot_at: string | null;
  last_seen_at: string | null;
  first_subscription_at: string | null;
  current_streak_months: number | null;
  operational_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface VipGroupRow {
  id: string;
  telegram_chat_id: number;
  name: string | null;
  public_name: string | null;
  is_active: boolean | null;
  admin_contact: string | null;
  payment_instructions: string | null;
  welcome_text: string | null;
  renewal_text: string | null;
  support_text: string | null;
}

export interface SubscriptionRow {
  id: string;
  telegram_user_id: string;
  vip_group_id: string;
  status: SubscriptionStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InviteLinkRow {
  id: string;
  telegram_user_id: string;
  vip_group_id: string | null;
  subscription_id: string | null;
  invite_link: string;
  expire_at: string | null;
  member_limit: number | null;
  sent_at: string | null;
  used_at: string | null;
  revoked_at: string | null;
}

export interface ReferralCodeRow {
  id: string;
  telegram_user_id: string;
  code: string;
}

export interface ReferralAttributionRow {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code_id: string;
}

export interface ReferralRewardRow {
  id: string;
  attribution_id: string;
  referrer_user_id: string;
  referred_user_id: string;
  rewarded_subscription_id: string | null;
  reward_days: number;
  status: ReferralRewardStatus;
}

export interface PaymentIntentRow {
  id: string;
  telegram_user_id: string;
  vip_group_id: string | null;
  subscription_id: string | null;
  status: PaymentIntentStatus;
  source: string;
  note: string | null;
  user_note: string | null;
  admin_note: string | null;
  selected_plan_id: string | null;
  amount_expected: number | null;
  currency: string | null;
  payment_method: string | null;
  seen_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}
