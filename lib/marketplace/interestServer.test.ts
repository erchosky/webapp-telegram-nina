import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMarketplaceInterest,
  marketplaceInterestInputSchema,
  notifyTelegramAdmin,
} from "@/lib/marketplace/interestServer";
import type { AuthContext } from "@/lib/telegram/auth";

describe("marketplace Telegram alerts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("no usa TELEGRAM_GROUP_CHAT_ID como fallback si falta TELEGRAM_ADMIN_ALERT_CHAT_ID", async () => {
    vi.stubEnv("TELEGRAM_ADMIN_ALERT_CHAT_ID", "");
    vi.stubEnv("TELEGRAM_GROUP_CHAT_ID", "-1001234567890");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:telegram-bot-secret-value");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await notifyTelegramAdmin({
      itemTitle: "Producto privado",
      interestId: "interest-1",
      username: "nina",
      name: "Nina",
      message: "Me interesa",
    });

    expect(result).toEqual({ ok: false, error: "telegram_alert_not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith("telegram_alert_not_configured", {
      hasAdminAlertChatId: false,
      hasBotToken: true,
    });
  });
});

describe("marketplace interest input", () => {
  it("only accepts the bounded public contract", () => {
    expect(marketplaceInterestInputSchema.safeParse({
      itemId: "3c1a2d0e-f2bd-4be1-a262-2bf5c46a0e99",
      message: "  Me interesa  ",
    })).toMatchObject({ success: true, data: { message: "Me interesa" } });

    for (const payload of [
      null,
      [],
      { itemId: 42 },
      { itemId: "not-a-uuid" },
      { itemId: "3c1a2d0e-f2bd-4be1-a262-2bf5c46a0e99", message: "x".repeat(1_001) },
      { itemId: "3c1a2d0e-f2bd-4be1-a262-2bf5c46a0e99", unexpected: true },
    ]) {
      expect(marketplaceInterestInputSchema.safeParse(payload).success).toBe(false);
    }
  });
});

describe("marketplace interest ownership", () => {
  const itemId = "3c1a2d0e-f2bd-4be1-a262-2bf5c46a0e99";

  it("always writes the authenticated Telegram identity, never a client-selected user", async () => {
    const inserted: Record<string, unknown>[] = [];
    const db = {
      from(table: string) {
        if (table === "marketplace_items") {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({
              data: {
                id: itemId,
                creator_id: null,
                title: "Pieza",
                status: "available",
                public_visible: true,
                requires_active_access: false,
                sold_visibility_until: null,
                marketplace_categories: { status: "published" },
              },
              error: null,
            }),
          };
          return query;
        }
        if (table === "purchase_interests") {
          const query = {
            insert: (payload: Record<string, unknown>) => {
              inserted.push(payload);
              return query;
            },
            select: () => query,
            single: async () => ({
              data: { id: "interest-1", status: "requested", created_at: "2026-07-10T00:00:00.000Z", metadata: {} },
              error: null,
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
          return query;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const ctx = {
      supabase: db,
      user: { id: "authenticated-user", telegram_user_id: 42, telegram_username: "owner" },
      tgUser: { id: 42, first_name: "Owner", username: "owner" },
    } as unknown as AuthContext;

    await createMarketplaceInterest(ctx, {
      itemId,
      message: "  Me interesa  ",
      metadata: { telegram_user_id: "attacker-controlled" },
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      item_id: itemId,
      telegram_user_id: "authenticated-user",
      telegram_user_numeric_id: 42,
      message: "Me interesa",
    });
    expect(infoSpy).toHaveBeenCalled();
  });

  it("does not create an interest for an access-restricted item without an active subscription", async () => {
    let insertCalled = false;
    const db = {
      from(table: string) {
        if (table === "marketplace_items") {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({
              data: {
                id: itemId,
                creator_id: null,
                title: "VIP",
                status: "available",
                public_visible: true,
                requires_active_access: true,
                sold_visibility_until: null,
                marketplace_categories: { status: "published" },
              },
              error: null,
            }),
          };
          return query;
        }
        if (table === "subscriptions") {
          const query = {
            select: () => query,
            eq: () => query,
            order: () => query,
            limit: async () => ({ data: [], error: null }),
          };
          return query;
        }
        if (table === "purchase_interests") {
          return { insert: () => { insertCalled = true; throw new Error("must not insert"); } };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };
    const ctx = {
      supabase: db,
      user: { id: "authenticated-user", telegram_user_id: 42 },
      tgUser: { id: 42 },
    } as unknown as AuthContext;

    await expect(createMarketplaceInterest(ctx, { itemId })).rejects.toMatchObject({
      status: 403,
      code: "active_access_required",
    });
    expect(insertCalled).toBe(false);
  });

  it("rejects direct item IDs from a hidden category before writing", async () => {
    let insertCalled = false;
    const db = {
      from(table: string) {
        if (table === "marketplace_items") {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({
              data: {
                id: itemId,
                creator_id: null,
                title: "Direct ID only",
                status: "available",
                public_visible: true,
                requires_active_access: false,
                sold_visibility_until: null,
                marketplace_categories: { status: "hidden" },
              },
              error: null,
            }),
          };
          return query;
        }
        if (table === "purchase_interests") {
          return { insert: () => { insertCalled = true; throw new Error("must not insert"); } };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };
    const ctx = {
      supabase: db,
      user: { id: "authenticated-user", telegram_user_id: 42 },
      tgUser: { id: 42 },
    } as unknown as AuthContext;

    await expect(createMarketplaceInterest(ctx, { itemId })).rejects.toMatchObject({
      status: 404,
      code: "item_not_visible",
    });
    expect(insertCalled).toBe(false);
  });
});
