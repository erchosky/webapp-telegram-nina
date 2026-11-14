import "server-only";
import type { AuthContext } from "@/lib/telegram/auth";
import type { InviteDTO } from "@/lib/api/dto";
import type { InviteLinkRow, SubscriptionRow } from "@/lib/domain/types";
import { ServiceError } from "@/lib/api/respond";
import { selectCurrentSubscription } from "@/lib/services/selectSubscription";
import { isActiveSubscription } from "@/lib/services/subscription";

const INVITE_COLUMNS =
  "id, telegram_user_id, vip_group_id, subscription_id, invite_link, expire_at, " +
  "member_limit, sent_at, used_at, revoked_at";
const SUBSCRIPTION_COLUMNS =
  "id, telegram_user_id, vip_group_id, status, starts_at, ends_at, created_at, updated_at";

/**
 * Return the user's most relevant invite link. Prefers a still-usable link
 * (not revoked, not used); otherwise returns the most recent one so the UI can
 * explain its state (revoked/used).
 */
export async function getInvite(ctx: AuthContext): Promise<InviteDTO> {
  const { supabase, user } = ctx;
  const current = await currentSubscription(ctx);

  if (!isActiveSubscription(current)) {
    return emptyInvite("inactive_subscription");
  }

  const { data, error } = await supabase
    .from("invite_links")
    .select(INVITE_COLUMNS)
    .eq("telegram_user_id", user.id)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "invite.getInvite" },
    });
  }

  const links = rankInviteLinks((data ?? []) as unknown as InviteLinkRow[], current);
  if (links.length === 0) {
    return emptyInvite("none");
  }

  const now = new Date();
  const usable = links.find((l) => isUsableInvite(l, now));
  const chosen = usable ?? links.find((link) => inviteState(link, now) !== null);
  if (!chosen) return emptyInvite("none");
  const state = usable ? "available" : inviteState(chosen, now);
  if (!state) return emptyInvite("none");

  return {
    state,
    inviteLink: state === "available" ? chosen.invite_link : null,
    expireAt: chosen.expire_at,
    usedAt: chosen.used_at,
    revokedAt: chosen.revoked_at,
  };
}

export function isUsableInvite(link: InviteLinkRow, now: Date = new Date()): boolean {
  return !link.revoked_at && !link.used_at && !isExpired(link.expire_at, now);
}

function matchScore(link: InviteLinkRow, current: SubscriptionRow): number {
  const hasSubscriptionScope = link.subscription_id !== null;
  const hasGroupScope = link.vip_group_id !== null;
  if (hasGroupScope && link.vip_group_id !== current.vip_group_id) return 3;
  if (hasSubscriptionScope && link.subscription_id === current.id) return 0;
  if (hasGroupScope && link.vip_group_id === current.vip_group_id) return 1;
  if (!hasSubscriptionScope && !hasGroupScope) return 2;
  return 3;
}

function rankInviteLinks(
  links: InviteLinkRow[],
  current: SubscriptionRow,
): InviteLinkRow[] {
  return [...links]
    .filter((link) => matchScore(link, current) < 3)
    .sort((a, b) => {
      const byMatch = matchScore(a, current) - matchScore(b, current);
      if (byMatch !== 0) return byMatch;
      return time(b.sent_at) - time(a.sent_at);
    });
}

function inviteState(
  link: InviteLinkRow,
  now: Date,
): Exclude<InviteDTO["state"], "available" | "none" | "inactive_subscription"> | null {
  if (link.revoked_at) return "revoked";
  if (link.used_at) return "used";
  if (isExpired(link.expire_at, now)) return "expired";
  return null;
}

function isExpired(expireAt: string | null, now: Date): boolean {
  if (!expireAt) return false;
  const value = new Date(expireAt).getTime();
  return Number.isFinite(value) && value <= now.getTime();
}

function emptyInvite(state: InviteDTO["state"]): InviteDTO {
  return { state, inviteLink: null, expireAt: null, usedAt: null, revokedAt: null };
}

async function currentSubscription(ctx: AuthContext): Promise<SubscriptionRow | null> {
  const { supabase, user } = ctx;
  const { data, error } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("telegram_user_id", user.id)
    .order("ends_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "invite.currentSubscription" },
    });
  }
  return selectCurrentSubscription((data ?? []) as unknown as SubscriptionRow[]);
}

function time(iso: string | null): number {
  if (!iso) return -Infinity;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : -Infinity;
}
