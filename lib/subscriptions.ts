import "server-only";
import type { SubscriptionRow } from "@/lib/domain/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { renewalEnd } from "@/lib/subscription-rules";
import { selectCurrentSubscription } from "@/lib/services/selectSubscription";
import { SUBSCRIPTION_STATUS } from "./statuses";
import { addDays, addNaturalMonths } from "./subscription-dates";
import { ensureDefaultVipGroup } from "./telegram/groups";

type AdminClient = ReturnType<typeof createAdminClient>;
const duplicateWindowMs = 10_000;
const activationStateReset = {
  warned_48h_at: null,
  warned_72h_at: null,
  warned_24h_at: null,
  warned_1h_at: null,
  expiration_detected_at: null,
  expulsion_status: "not_required",
  expulsion_attempts: 0,
  last_expulsion_attempt_at: null,
  last_expulsion_error: null,
  expelled_at: null,
  operational_status: "payment_validated"
};

function wasUpdatedVeryRecently(row: { updated_at?: string | null } | null | undefined, now = new Date()) {
  if (!row?.updated_at) return false;
  const updatedAt = new Date(row.updated_at);
  return !Number.isNaN(updatedAt.getTime()) && now.getTime() - updatedAt.getTime() >= 0 && now.getTime() - updatedAt.getTime() < duplicateWindowMs;
}

function hasCurrentActiveAccess(subscription: { status?: string | null; ends_at?: string | null } | null | undefined, now: Date) {
  if (subscription?.status !== SUBSCRIPTION_STATUS.ACTIVE) return false;
  if (!subscription.ends_at) return true;
  const endsAt = new Date(subscription.ends_at);
  return !Number.isNaN(endsAt.getTime()) && endsAt > now;
}

function isConsecutiveRenewal(subscription: { status?: string | null; ends_at?: string | null } | null | undefined, now: Date) {
  if (subscription?.status !== SUBSCRIPTION_STATUS.ACTIVE || !subscription.ends_at) return false;
  const endsAt = new Date(subscription.ends_at);
  return !Number.isNaN(endsAt.getTime()) && endsAt >= now;
}

function nextStreak(current: number | null | undefined, consecutive: boolean) {
  return consecutive ? Math.max(1, (current ?? 0) + 1) : 1;
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

async function scheduleFirstDayMessage(db: AdminClient, userId: string, groupId: string, base: Date) {
  try {
    await db.from("scheduled_messages").insert({
      telegram_user_id: userId,
      vip_group_id: groupId,
      type: "first_day",
      scheduled_at: new Date(base.getTime() + 24 * 3_600_000).toISOString(),
      payload: { enabled: false, note: "Preparado para drip onboarding futuro; no se envía todavía." }
    });
  } catch (error) {
    console.error("schedule_first_day_message_failed", error);
  }
}

async function readSubscriptionRows(query: unknown): Promise<{ data: SubscriptionRow[] | null; error: unknown }> {
  const result = typeof query === "object" && query !== null && "then" in query
    ? await (query as PromiseLike<{ data: SubscriptionRow[] | null; error: unknown }>)
    : typeof query === "object" && query !== null && "maybeSingle" in query
      ? await (query as { maybeSingle: () => Promise<{ data: SubscriptionRow | null; error: unknown }> }).maybeSingle()
      : { data: null, error: new Error("Invalid subscription query") };
  return { data: Array.isArray(result.data) ? result.data : result.data ? [result.data] : null, error: result.error };
}

export async function getCurrentSubscription(
  userId: string,
  db: AdminClient = createAdminClient(),
  now = new Date(),
  vipGroupId?: string,
) {
  let query = db.from("subscriptions").select("*").eq("telegram_user_id", userId);
  if (vipGroupId) query = query.eq("vip_group_id", vipGroupId);
  query = query.order("created_at", { ascending: false }).limit(100);
  const { data, error } = await readSubscriptionRows(query);
  if (error) throw error;
  return selectCurrentSubscription(data ?? [], now);
}
async function groupId(db: AdminClient = createAdminClient()) {
  return (await ensureDefaultVipGroup(db)).id;
}

export type ActivationDuration =
  | { type: "days"; days: number }
  | { type: "months"; months: number }
  | { type: "until"; endsAt: Date };

function activationEnd(now: Date, duration: ActivationDuration) {
  if (duration.type === "days") return addDays(now, duration.days);
  if (duration.type === "months") return addNaturalMonths(now, duration.months);
  return duration.endsAt;
}

export async function activateForDuration(userId: string, duration: ActivationDuration, db: AdminClient = createAdminClient(), now = new Date()) {
  const end = activationEnd(now, duration);
  if (Number.isNaN(end.getTime()) || end <= now) throw new Error("La caducidad debe estar en el futuro.");
  const existing = await getCurrentSubscription(userId, db);
  if (hasCurrentActiveAccess(existing, now)) return existing;
  const consecutive = isConsecutiveRenewal(existing, now);
  const payload = { telegram_user_id: userId, vip_group_id: existing?.vip_group_id ?? await groupId(db), status: "active", starts_at: now.toISOString(), ends_at: end.toISOString(), activated_by: "admin", source: "manual_payment", ...activationStateReset };
  const query = existing ? db.from("subscriptions").update(payload).eq("id", existing.id) : db.from("subscriptions").insert(payload);
  const { data, error } = await query.select().single();
  if (error) {
    if (isUniqueViolation(error)) {
      const current = await getCurrentSubscription(userId, db);
      if (current?.status === "active" && current.ends_at && new Date(current.ends_at) > now) return current;
    }
    throw error;
  }
  const { data: user, error: userError } = await db.from("telegram_users").select("first_subscription_at,current_streak_months").eq("id", userId).maybeSingle();
  if (userError) throw userError;
  const nextStreakValue = nextStreak(user?.current_streak_months, consecutive);
  const { error: firstError } = await db.from("telegram_users").update({
    first_subscription_at: user?.first_subscription_at ?? now.toISOString(),
    current_streak_months: nextStreakValue
  }).eq("id", userId); if (firstError) throw firstError;
  await scheduleFirstDayMessage(db, userId, data.vip_group_id, now);
  return data;
}

export async function activateForOneMonth(userId: string, db: AdminClient = createAdminClient(), now = new Date()) {
  return activateForDuration(userId, { type: "months", months: 1 }, db, now);
}

export type ExistingMemberInput = {
  telegramUserId: number;
  telegramUsername?: string | null;
  memberSince: Date;
  endsAt?: Date | null;
  internalNotes?: string | null;
};

export async function saveExistingMember(input: ExistingMemberInput, db: AdminClient = createAdminClient()) {
  const username = input.telegramUsername?.replace(/^@/, "") || null;
  const { data: user, error: userError } = await db.from("telegram_users").upsert({
    telegram_user_id: input.telegramUserId,
    telegram_username: username
  }, { onConflict: "telegram_user_id" }).select().single();
  if (userError) throw userError;

  const existing = await getCurrentSubscription(user.id, db);
  const hasReviewedEnd = Boolean(input.endsAt);
  const status = hasReviewedEnd ? "active" : "needs_manual_review";
  const payload = {
    telegram_user_id: user.id,
    vip_group_id: existing?.vip_group_id ?? await groupId(db),
    status,
    operational_status: hasReviewedEnd ? "active_in_group" : "expired_manual_review",
    starts_at: input.memberSince.toISOString(),
    ends_at: input.endsAt ? input.endsAt.toISOString() : null,
    activated_by: "admin",
    source: "migration",
    warned_48h_at: null,
    warned_72h_at: null,
    warned_24h_at: null,
    warned_1h_at: null,
    expiration_detected_at: null,
    expulsion_status: "not_required",
    expulsion_attempts: 0,
    last_expulsion_attempt_at: null,
    last_expulsion_error: null,
    expelled_at: null
  };
  const subscriptionQuery = existing
    ? db.from("subscriptions").update(payload).eq("id", existing.id)
    : db.from("subscriptions").insert(payload);
  const { data: subscription, error: subscriptionError } = await subscriptionQuery.select().single();
  if (subscriptionError) throw subscriptionError;
  const { error: profileError } = await db.from("telegram_users").update({
    first_subscription_at: input.memberSince.toISOString(),
    internal_notes: input.internalNotes || null,
    operational_status: hasReviewedEnd ? "active_in_group" : "expired_manual_review"
  }).eq("id", user.id);
  if (profileError) throw profileError;
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    action: hasReviewedEnd ? "existing_member_created" : "existing_member_needs_manual_review",
    target_user_id: user.id,
    message: hasReviewedEnd ? "Miembro existente migrado con caducidad revisada" : "Miembro existente migrado sin caducidad; requiere revisión manual",
    metadata: {
      telegram_user_id: input.telegramUserId,
      telegram_username: username,
      member_since: input.memberSince.toISOString(),
      ends_at: input.endsAt ? input.endsAt.toISOString() : null,
      no_invite_sent: true,
      source: "migration"
    },
    performed_by: "admin"
  });
  if (auditError) throw auditError;
  return { user, subscription };
}
export async function activateUntil(userId: string, endsAt: Date) {
  const db = createAdminClient(), now = new Date(), existing = await getCurrentSubscription(userId);
  const payload = { telegram_user_id: userId, vip_group_id: existing?.vip_group_id ?? await groupId(), status: "active", starts_at: now.toISOString(), ends_at: endsAt.toISOString(), activated_by: "admin", source: "migration", ...activationStateReset };
  const query = existing ? db.from("subscriptions").update(payload).eq("id", existing.id) : db.from("subscriptions").insert(payload);
  const { data, error } = await query.select().single(); if (error) throw error;
  const { error: firstError } = await db.from("telegram_users").update({ first_subscription_at: now.toISOString() }).eq("id", userId).is("first_subscription_at", null); if (firstError) throw firstError;
  return data;
}
export async function renewForOneMonth(userId: string) {
  const current = await getCurrentSubscription(userId); if (!current) return activateForOneMonth(userId); const db = createAdminClient();
  if (current.status === "active" && current.ends_at && new Date(current.ends_at) > new Date() && wasUpdatedVeryRecently(current)) return current;
  const now = new Date();
  const consecutive = isConsecutiveRenewal(current, now);
  const end = renewalEnd(now, current.status, current.ends_at);
  const { data, error } = await db.from("subscriptions").update({ status: "active", starts_at: current.starts_at ?? new Date().toISOString(), ends_at: end.toISOString(), ...activationStateReset }).eq("id", current.id).select().single();
  if (error) throw error; const { data: user } = await db.from("telegram_users").select("current_streak_months").eq("id", userId).maybeSingle(); const nextStreakValue = nextStreak(user?.current_streak_months, consecutive); const { error: streakError } = await db.from("telegram_users").update({ first_subscription_at: current.starts_at ?? new Date().toISOString(), current_streak_months: nextStreakValue }).eq("id", userId); if (streakError) throw streakError; await scheduleFirstDayMessage(db, userId, data.vip_group_id, new Date()); return data;
}
export const activateFor30Days = activateForOneMonth;
export const renewFor30Days = renewForOneMonth;
export async function setStatus(userId: string, status: "pending"|"expired"|"cancelled") {
  const current = await getCurrentSubscription(userId), db = createAdminClient();
  if (current) { const { error } = await db.from("subscriptions").update({ status }).eq("id", current.id); if (error) throw error; }
  else { const { error } = await db.from("subscriptions").insert({ telegram_user_id: userId, vip_group_id: await groupId(), status, source: "manual" }); if (error) throw error; }
}
export async function changeEndDate(
  userId: string,
  endsAt: string,
  expectedUpdatedAt?: string | null,
  db: AdminClient = createAdminClient(),
) {
  const current = await getCurrentSubscription(userId, db); if (!current) throw new Error("El usuario no tiene suscripción");
  if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) throw new Error("La suscripción cambió, recarga y vuelve a intentar.");
  let update = db.from("subscriptions").update({ ends_at: new Date(endsAt).toISOString(), status: "active", ...activationStateReset }).eq("id", current.id);
  if (expectedUpdatedAt) update = update.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await update.select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("La suscripción cambió, recarga y vuelve a intentar.");
}
export async function getExpiredActiveSubscriptions(limit?: number) {
  let query = createAdminClient().from("subscriptions").select("*, telegram_users(*), vip_groups(*)").eq("status", "active").lte("ends_at", new Date().toISOString()).order("ends_at", { ascending: true });
  if (limit) query = query.limit(limit + 1);
  const { data, error } = await query; if (error) throw error; return data ?? [];
}
export async function getPendingExpulsions(limit?: number) {
  let query = createAdminClient().from("subscriptions").select("*, telegram_users(*), vip_groups!inner(*)").eq("status", "expired").not("ends_at", "is", null).in("expulsion_status", ["pending", "failed"]).eq("vip_groups.automatic_expulsion_enabled", true).order("last_expulsion_attempt_at", { ascending: true, nullsFirst: true });
  if (limit) query = query.limit(limit + 1);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
export async function getExpiringSoon(limit?: number) {
  const now = new Date(), until = new Date(now.getTime() + 48*3_600_000);
  let query = createAdminClient().from("subscriptions").select("*, telegram_users(*), vip_groups(*)").eq("status", "active").is("warned_48h_at", null).gt("ends_at", now.toISOString()).lte("ends_at", until.toISOString()).order("ends_at", { ascending: true });
  if (limit) query = query.limit(limit + 1);
  const { data, error } = await query; if (error) throw error; return data ?? [];
}
