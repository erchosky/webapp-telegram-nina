import "server-only";
import { Bot } from "grammy";
import { telegramEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { telegramApiRoot } from "@/lib/telegram/client-config";

const telegramApiStore = globalThis as typeof globalThis & {
  __vipGuardTelegramApi?: ReturnType<typeof createApi>;
  __vipGuardTelegramApiCacheKey?: string;
};

function createApi(token: string, apiRoot: string) {
  return new Bot(token, { client: { apiRoot } }).api;
}

const api = () => {
  const token = telegramEnv().TELEGRAM_BOT_TOKEN;
  const apiRoot = telegramApiRoot();
  const cacheKey = `${apiRoot}:${token}`;
  if (!telegramApiStore.__vipGuardTelegramApi || telegramApiStore.__vipGuardTelegramApiCacheKey !== cacheKey) {
    telegramApiStore.__vipGuardTelegramApi = createApi(token, apiRoot);
    telegramApiStore.__vipGuardTelegramApiCacheKey = cacheKey;
  }
  return telegramApiStore.__vipGuardTelegramApi;
};
export const sendMessage = (telegramUserId: string | number, text: string, options?: Parameters<ReturnType<typeof api>["sendMessage"]>[2]) => api().sendMessage(telegramUserId, text, options);
export const getBotInfo = () => api().getMe();
export const getChatInfo = (chatId: string | number) => api().getChat(chatId);
export type TelegramGroupTestResult = {
  ok: boolean;
  groupFound: boolean;
  chatTitle: string | null;
  botInside: boolean;
  botAdmin: boolean;
  canCreateInvite: boolean;
  canRestrictMembers: boolean;
  errorMessage?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function testTelegramGroup(chatId: string | number, telegramApi = api()): Promise<TelegramGroupTestResult> {
  let chatTitle: string | null = null;
  try {
    const chat = await telegramApi.getChat(chatId);
    chatTitle = "title" in chat ? chat.title ?? null : null;
    try {
    const me = await telegramApi.getMe();
    const member = await telegramApi.getChatMember(chatId, me.id);
    const botInside = member.status !== "left" && member.status !== "kicked";
    const botAdmin = member.status === "administrator" || member.status === "creator";
    const canCreateInvite = member.status === "creator" || (member.status === "administrator" && member.can_invite_users);
    const canRestrictMembers = member.status === "creator" || (member.status === "administrator" && member.can_restrict_members);
    return {
      ok: botInside && botAdmin && canCreateInvite && canRestrictMembers,
      groupFound: true,
        chatTitle,
      botInside,
      botAdmin,
      canCreateInvite,
      canRestrictMembers
    };
    } catch (error) {
      return {
        ok: false,
        groupFound: true,
        chatTitle,
        botInside: false,
        botAdmin: false,
        canCreateInvite: false,
        canRestrictMembers: false,
        errorMessage: errorMessage(error)
      };
    }
  } catch (error) {
    return {
      ok: false,
      groupFound: false,
      chatTitle: null,
      botInside: false,
      botAdmin: false,
      canCreateInvite: false,
      canRestrictMembers: false,
      errorMessage: errorMessage(error)
    };
  }
}
export async function createInviteLink(userId: string, group: { id: string; telegram_chat_id: string | number }, telegramApi = api(), expiresBefore?: string | Date | null, subscriptionId?: string | null) {
  const db = createAdminClient();
  const now = new Date();
  let existingQuery = db
    .from("invite_links")
    .select("*")
    .eq("telegram_user_id", userId)
    .eq("vip_group_id", group.id)
    .is("revoked_at", null)
    .is("used_at", null)
    .gt("expire_at", now.toISOString())
    .order("expire_at", { ascending: false });
  if (subscriptionId) existingQuery = existingQuery.eq("subscription_id", subscriptionId);
  const { data: existing, error: existingError } = await existingQuery
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { ...existing, reused: true };

  const defaultExpire = new Date(now.getTime() + 24 * 3_600_000);
  const subscriptionExpire = expiresBefore ? new Date(expiresBefore) : null;
  const expire = subscriptionExpire && !Number.isNaN(subscriptionExpire.getTime()) && subscriptionExpire < defaultExpire ? subscriptionExpire : defaultExpire;
  if (expire <= now) throw new Error("No se puede crear un enlace para una suscripción caducada.");
  const link = await telegramApi.createChatInviteLink(group.telegram_chat_id, { member_limit: 1, expire_date: Math.floor(expire.getTime()/1000), name: "VIP Access" });
  const { data, error } = await db.from("invite_links").insert({ telegram_user_id: userId, vip_group_id: group.id, subscription_id: subscriptionId ?? null, invite_link: link.invite_link, expire_at: expire.toISOString(), member_limit: 1 }).select().single();
  if (error) throw error; return { ...data, reused: false };
}
export async function markInviteSent(id: string) {
  const { error } = await createAdminClient().from("invite_links").update({ sent_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function markInviteDeliveryError(id: string, deliveryError: string) {
  const { error } = await createAdminClient().from("invite_links").update({ delivery_error: deliveryError.slice(0, 500) }).eq("id", id);
  if (error) throw error;
}
export const banUser = (chatId: string | number, telegramUserId: string | number) =>
  api().banChatMember(chatId, Number(telegramUserId));

export const unbanUser = (chatId: string | number, telegramUserId: string | number) =>
  api().unbanChatMember(chatId, Number(telegramUserId), { only_if_banned: true });

export async function kickUser(chatId: string | number, telegramUserId: string | number) {
  await banUser(chatId, telegramUserId);
  await unbanUser(chatId, telegramUserId);
}
