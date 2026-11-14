import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/telegram/auth";
import type { InviteLinkRow, SubscriptionRow, TelegramUserRow } from "@/lib/domain/types";
import { getInvite, isUsableInvite } from "@/lib/services/invite";

describe("isUsableInvite", () => {
  it("rejects expired links", () => {
    expect(
      isUsableInvite(invite({ expire_at: "2026-01-01T00:00:00Z" }), new Date("2026-06-26T00:00:00Z")),
    ).toBe(false);
  });

  it("accepts unused, unrevoked, non-expired links", () => {
    expect(
      isUsableInvite(invite({ expire_at: "2026-07-01T00:00:00Z" }), new Date("2026-06-26T00:00:00Z")),
    ).toBe(true);
  });
});

describe("getInvite", () => {
  it("does not show an invite when the user has no active VIP", async () => {
    const result = await getInvite(ctxWith([], [invite()]));

    expect(result.state).toBe("inactive_subscription");
    expect(result.inviteLink).toBeNull();
  });

  it("does not expose expired invite links", async () => {
    const result = await getInvite(
      ctxWith([subscription()], [invite({ expire_at: "2026-01-01T00:00:00Z" })]),
    );

    expect(result.state).toBe("expired");
    expect(result.inviteLink).toBeNull();
  });

  it("does not expose used invite links", async () => {
    const result = await getInvite(
      ctxWith([subscription()], [invite({ used_at: "2026-06-26T12:00:00Z" })]),
    );

    expect(result.state).toBe("used");
    expect(result.inviteLink).toBeNull();
  });

  it("does not expose revoked invite links", async () => {
    const result = await getInvite(
      ctxWith([subscription()], [invite({ revoked_at: "2026-06-26T12:00:00Z" })]),
    );

    expect(result.state).toBe("revoked");
    expect(result.inviteLink).toBeNull();
  });

  it("can use a same-group invite when subscription id differs", async () => {
    const result = await getInvite(
      ctxWith([subscription()], [invite({ subscription_id: "old-sub" })]),
    );

    expect(result.state).toBe("available");
    expect(result.inviteLink).toBe("https://t.me/+abc");
  });

  it("does not expose an invite from another VIP group", async () => {
    const result = await getInvite(
      ctxWith([subscription()], [invite({ vip_group_id: "old-group" })]),
    );

    expect(result.state).toBe("none");
    expect(result.inviteLink).toBeNull();
  });

  it("does not expose active-looking links when the subscription has expired", async () => {
    const result = await getInvite(
      ctxWith([subscription({ ends_at: "2026-01-01T00:00:00Z" })], [invite()]),
    );

    expect(result.state).toBe("inactive_subscription");
    expect(result.inviteLink).toBeNull();
  });

  it("returns an available invite for active, non-expired subscriptions", async () => {
    const result = await getInvite(ctxWith([subscription()], [invite()]));

    expect(result.state).toBe("available");
    expect(result.inviteLink).toBe("https://t.me/+abc");
  });

  it("prefers the invite scoped to the current subscription", async () => {
    const result = await getInvite(
      ctxWith(
        [subscription({ id: "sub-current" })],
        [
          invite({ id: "invite-group", subscription_id: null, invite_link: "https://t.me/+group", sent_at: "2026-06-27T00:00:00Z" }),
          invite({ id: "invite-current", subscription_id: "sub-current", invite_link: "https://t.me/+current", sent_at: "2026-06-26T00:00:00Z" }),
        ],
      ),
    );

    expect(result.state).toBe("available");
    expect(result.inviteLink).toBe("https://t.me/+current");
  });
});

function ctxWith(subscriptions: SubscriptionRow[], invites: InviteLinkRow[]): AuthContext {
  const supabase = {
    from(table: string) {
      if (table === "subscriptions") return chain({ data: subscriptions, error: null });
      if (table === "invite_links") return chain({ data: invites, error: null });
      throw new Error(`Unexpected table ${table}`);
    },
  };
  return { supabase: supabase as never, tgUser: { id: 123 }, user: user() };
}

function chain(result: unknown): Record<string, unknown> {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    order: () => self,
    limit: () => self,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return self;
}

function user(): TelegramUserRow {
  return {
    id: "user-1",
    telegram_user_id: 123,
    telegram_username: "nina",
    first_name: "Creator",
    last_name: null,
    language_code: "es",
    first_seen_at: null,
    started_bot_at: null,
    last_seen_at: null,
    first_subscription_at: null,
    current_streak_months: 0,
    operational_status: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function subscription(partial: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "sub-1",
    telegram_user_id: "user-1",
    vip_group_id: "group-1",
    status: "active",
    starts_at: "2026-06-01T00:00:00Z",
    ends_at: "2099-01-01T00:00:00Z",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...partial,
  };
}

function invite(partial: Partial<InviteLinkRow> = {}): InviteLinkRow {
  return {
    id: "invite-1",
    telegram_user_id: "user-1",
    vip_group_id: "group-1",
    subscription_id: "sub-1",
    invite_link: "https://t.me/+abc",
    expire_at: "2099-01-01T00:00:00Z",
    member_limit: 1,
    sent_at: "2026-06-26T00:00:00Z",
    used_at: null,
    revoked_at: null,
    ...partial,
  };
}
