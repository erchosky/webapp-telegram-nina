import "server-only";
import type { AuthContext } from "@/lib/telegram/auth";
import type { SubscriptionRow } from "@/lib/domain/types";
import { ServiceError } from "@/lib/api/respond";
import { getEffectiveSubscriptionStatus } from "@/lib/services/subscription";
import { withTimeout } from "@/lib/util/timeout";
import { z } from "zod";
import { telegramApiMethodUrl } from "@/lib/telegram/client-config";

const INTEREST_TIMEOUT_MS = 8_000;
const TELEGRAM_TIMEOUT_MS = 5_000;

type InterestItemRow = {
  id: string;
  creator_id: string | null;
  category_id: string | null;
  title: string;
  status: string | null;
  public_visible: boolean | null;
  requires_active_access: boolean | null;
  sold_visibility_until: string | null;
  marketplace_categories: { status: string | null } | Array<{ status: string | null }> | null;
};

type InsertedInterest = {
  id: string;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export interface CreateMarketplaceInterestInput {
  itemId: string;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Public request contract. Keep it at the server boundary so malformed JSON
 * never reaches the service-role client as an untyped value.
 */
export const marketplaceInterestInputSchema = z.object({
  itemId: z.string().uuid(),
  message: z.string().trim().max(1_000).optional(),
}).strict();

const marketplaceInterestServiceInputSchema = marketplaceInterestInputSchema
  .extend({ metadata: z.record(z.unknown()).optional() })
  .strict();

export interface MarketplaceInterestDTO {
  id: string;
  status: string;
  createdAt: string;
}

export async function createMarketplaceInterest(
  ctx: AuthContext,
  input: CreateMarketplaceInterestInput,
): Promise<MarketplaceInterestDTO> {
  const parsed = marketplaceInterestServiceInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceError(400, "invalid_interest_input", "Datos de interés inválidos", {
      publicMessage: "Revisa el producto y el mensaje antes de enviarlo.",
    });
  }

  return withTimeout(
    createInterestUnsafe(ctx, {
      ...input,
      itemId: parsed.data.itemId,
      message: parsed.data.message,
    }),
    INTEREST_TIMEOUT_MS,
    "interest",
  );
}

async function createInterestUnsafe(
  ctx: AuthContext,
  input: CreateMarketplaceInterestInput & { itemId: string },
): Promise<MarketplaceInterestDTO> {
  const { supabase, user, tgUser } = ctx;
  const { data: itemData, error: itemError } = await supabase
    .from("marketplace_items")
    .select(
      "id, creator_id, category_id, title, status, public_visible, requires_active_access, sold_visibility_until, " +
        "marketplace_categories!inner(status)",
    )
    .eq("id", input.itemId)
    .maybeSingle();

  if (itemError) {
    throw new ServiceError(500, "db_error", itemError.message, {
      context: { service: "marketplace.interest.item" },
    });
  }
  if (!itemData) {
    throw new ServiceError(404, "item_not_found", "Producto no encontrado");
  }

  const item = itemData as unknown as InterestItemRow;
  if (!isRequestableItem(item)) {
    throw new ServiceError(404, "item_not_visible", "Producto no disponible");
  }

  if (item.requires_active_access === true && !(await hasActiveAccess(ctx))) {
    throw new ServiceError(
      403,
      "active_access_required",
      "Este producto requiere acceso activo",
      { publicMessage: "Este producto requiere acceso activo. Reintenta cuando podamos verificar tu estado VIP." },
    );
  }

  const baseMetadata = {
    ...(input.metadata ?? {}),
    source: "miniapp_marketplace",
    item_title: item.title,
    telegram_alert: "pending",
  };

  const { data, error } = await supabase
    .from("purchase_interests")
    .insert({
      creator_id: item.creator_id,
      category_id: item.category_id,
      item_id: item.id,
      telegram_user_id: user.id,
      telegram_user_numeric_id: user.telegram_user_id,
      user_name: displayName(tgUser.first_name, tgUser.last_name),
      telegram_username: tgUser.username ?? user.telegram_username,
      message: cleanMessage(input.message),
      status: "requested",
      metadata: baseMetadata,
    })
    .select("id, status, created_at, metadata")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await findOpenInterest(ctx, item.id);
      if (existing) {
        return {
          id: existing.id,
          status: existing.status,
          createdAt: existing.created_at,
        };
      }
    }
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "marketplace.interest.insert", code: error.code },
    });
  }

  const interest = data as InsertedInterest;
  const alertResult = await notifyTelegramAdmin({
    itemTitle: item.title,
    interestId: interest.id,
    username: tgUser.username ?? user.telegram_username,
    name: displayName(tgUser.first_name, tgUser.last_name),
    message: cleanMessage(input.message),
  });

  await supabase
    .from("purchase_interests")
    .update({
      metadata: {
        ...(interest.metadata ?? {}),
        telegram_alert: alertResult.ok ? "sent" : "failed",
        telegram_alert_error: alertResult.ok ? null : alertResult.error,
      },
    })
    .eq("id", interest.id);

  return {
    id: interest.id,
    status: interest.status,
    createdAt: interest.created_at,
  };
}

function isRequestableItem(item: InterestItemRow, now = new Date()): boolean {
  const category = Array.isArray(item.marketplace_categories)
    ? item.marketplace_categories[0]
    : item.marketplace_categories;
  if (category?.status !== "published" || item.public_visible !== true) return false;
  if (item.status === "available" || item.status === "reserved") return true;
  if (item.status !== "sold" || !item.sold_visibility_until) return false;
  const visibleUntil = new Date(item.sold_visibility_until).getTime();
  return Number.isFinite(visibleUntil) && visibleUntil > now.getTime();
}

async function findOpenInterest(
  ctx: AuthContext,
  itemId: string,
): Promise<InsertedInterest | null> {
  const { data, error } = await ctx.supabase
    .from("purchase_interests")
    .select("id, status, created_at, metadata")
    .eq("telegram_user_id", ctx.user.id)
    .eq("item_id", itemId)
    .in("status", ["requested", "seen", "in_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "marketplace.interest.find_open" },
    });
  }
  return (data as InsertedInterest | null) ?? null;
}

async function hasActiveAccess(ctx: AuthContext): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from("subscriptions")
    .select("id, telegram_user_id, vip_group_id, status, starts_at, ends_at, created_at, updated_at")
    .eq("telegram_user_id", ctx.user.id)
    .order("ends_at", { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) {
    throw new ServiceError(500, "db_error", error.message, {
      context: { service: "marketplace.interest.subscriptions" },
    });
  }
  return ((data ?? []) as unknown as SubscriptionRow[]).some(
    (sub) => getEffectiveSubscriptionStatus(sub) === "active",
  );
}

export async function notifyTelegramAdmin(input: {
  itemTitle: string;
  interestId: string;
  username: string | null | undefined;
  name: string | null;
  message: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const chatId = process.env.TELEGRAM_ADMIN_ALERT_CHAT_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!chatId || !botToken) {
    console.info("telegram_alert_not_configured", {
      hasAdminAlertChatId: Boolean(chatId),
      hasBotToken: Boolean(botToken),
    });
    return { ok: false, error: "telegram_alert_not_configured" };
  }

  const userLine = input.username
    ? `@${input.username}`
    : input.name || "Usuario Telegram";
  const text = [
    "Nuevo interés de marketplace",
    `Producto: ${input.itemTitle}`,
    `Usuario: ${userLine}`,
    `Interés: ${input.interestId}`,
    input.message ? `Mensaje: ${input.message}` : null,
  ].filter(Boolean).join("\n");

  try {
    const res = await withTimeout(
      fetch(telegramApiMethodUrl(botToken, "sendMessage"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      }),
      TELEGRAM_TIMEOUT_MS,
      "telegram_alert",
    );
    if (!res.ok) return { ok: false, error: `telegram_http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "telegram_alert_failed" };
  }
}

function displayName(firstName?: string, lastName?: string): string | null {
  const value = [firstName, lastName].filter(Boolean).join(" ").trim();
  return value || null;
}

function cleanMessage(message: string | null | undefined): string | null {
  const value = (message ?? "").trim();
  if (!value) return null;
  return value.slice(0, 1_000);
}
