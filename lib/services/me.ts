import "server-only";
import type { AuthContext } from "@/lib/telegram/auth";
import type { MeDTO } from "@/lib/api/dto";
import type { SubscriptionRow, VipGroupRow } from "@/lib/domain/types";
import { telegramLanguage } from "@/lib/telegram/content";
import { daysUntil } from "@/lib/util/dates";
import { selectCurrentSubscription } from "@/lib/services/selectSubscription";
import { getEffectiveSubscriptionStatus } from "@/lib/services/subscription";
import { getPaymentIntent } from "@/lib/services/payments";
import { ServiceError } from "@/lib/api/respond";
import { ENABLE_PAYMENT_INTENTS } from "@/lib/config/features";

const SUBSCRIPTION_COLUMNS =
  "id, telegram_user_id, vip_group_id, status, starts_at, ends_at, created_at, updated_at";
const GROUP_COLUMNS =
  "id, telegram_chat_id, name, public_name, is_active, admin_contact, " +
  "payment_instructions, welcome_text, renewal_text, support_text";

export async function getMe(ctx: AuthContext): Promise<MeDTO> {
  const { supabase, user } = ctx;

  const { data: subsData, error: subsError } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("telegram_user_id", user.id)
    .order("ends_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (subsError) {
    throw new ServiceError(500, "db_error", subsError.message, {
      context: { service: "me.getMe.subscriptions" },
    });
  }

  const subscriptions = (subsData ?? []) as unknown as SubscriptionRow[];
  const current = selectCurrentSubscription(subscriptions);
  const currentStatus = getEffectiveSubscriptionStatus(current);

  const [group, openIntent] = await Promise.all([
    resolveGroup(ctx, currentStatus ? current?.vip_group_id ?? null : null),
    ENABLE_PAYMENT_INTENTS ? getPaymentIntent(ctx) : Promise.resolve(null),
  ]);

  return {
    language: telegramLanguage(user.language_code),
    user: {
      firstName: user.first_name,
      username: user.telegram_username,
      streakMonths: user.current_streak_months ?? 0,
    },
    subscription: current
      ? {
          status: currentStatus ?? current.status,
          createdAt: current.created_at,
          startsAt: current.starts_at,
          endsAt: current.ends_at,
          daysLeft: daysUntil(current.ends_at),
        }
      : null,
    group: group
      ? {
          publicName: group.public_name ?? group.name,
          adminContact: group.admin_contact,
          paymentInstructions: group.payment_instructions,
          renewalText: group.renewal_text,
          supportText: group.support_text,
        }
      : null,
    hasOpenPaymentIntent: openIntent !== null,
    paymentIntent: openIntent,
  };
}

/**
 * Resolve the group to show. If the user has a subscription, use its group.
 * For users without any subscription, only expose a fallback group when there
 * is exactly one active group; otherwise avoid leaking an arbitrary group.
 */
async function resolveGroup(
  ctx: AuthContext,
  groupId: string | null,
): Promise<VipGroupRow | null> {
  const { supabase } = ctx;

  if (groupId) {
    const { data, error } = await supabase
      .from("vip_groups")
      .select(GROUP_COLUMNS)
      .eq("id", groupId)
      .maybeSingle();
    if (error) {
      throw new ServiceError(500, "db_error", error.message, {
        context: { service: "me.resolveGroup.byId" },
      });
    }
    if (data) return data as unknown as VipGroupRow;
  }

  const { data, error } = await supabase
    .from("vip_groups")
    .select(GROUP_COLUMNS)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(2);
  if (error) {
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "me.resolveGroup.fallback" },
    });
  }
  const groups = (data ?? []) as unknown as VipGroupRow[];
  return groups.length === 1 ? groups[0] : null;
}
