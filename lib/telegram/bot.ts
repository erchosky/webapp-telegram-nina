import "server-only";
import { Bot, type Context } from "grammy";
import type { User } from "grammy/types";
import { telegramEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { botLog } from "@/lib/logs";
import { getCurrentSubscription } from "@/lib/subscriptions";
import { userAccessMessage } from "@/lib/user-access";
import { messagesFor } from "./messages";
import { getTelegramMessageContext } from "@/lib/telegram/message-settings";
import { checkRateLimit } from "../security/rate-limit";
import { sanitizeTelegramLogText } from "./log-sanitize";
import { profileMessage } from "./profile";
import { canSendInvite } from "../subscription-rules";
import { createInviteLink, markInviteSent } from "./api";
import { recordReferralStart, referralLinkForUser } from "../referrals";
import { ensureDefaultVipGroup } from "./groups";
import { ENABLE_REFERRALS } from "../config/features";
import { telegramApiRoot } from "./client-config";

export const TELEGRAM_USER_RATE_LIMIT = { limit: 30, windowMs: 60_000 };
const UNKNOWN_PRIVATE_COOLDOWN_MS = 10 * 60_000;
const vipMenu = (languageCode?: string | null) => {
  const messages = messagesFor(languageCode);
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: messages.menuSubscription, callback_data: "vip_subscription" }, { text: messages.menuHelp, callback_data: "vip_help" }],
        [{ text: messages.menuAccess, callback_data: "vip_access" }, { text: messages.menuProfile, callback_data: "vip_profile" }]
      ]
    }
  };
};

function activeSubscriptionIsCurrent(subscription: { status?: string | null; ends_at?: string | null } | null | undefined, now = new Date()) {
  if (subscription?.status !== "active") return false;
  if (!subscription.ends_at) return true;
  const endsAt = new Date(subscription.ends_at).getTime();
  return Number.isFinite(endsAt) && endsAt > now.getTime();
}

async function atStep<T>(currentStep: string, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (typeof error === "object" && error !== null) Object.assign(error, { currentStep });
    throw error;
  }
}

async function safeReply(ctx: Pick<Context, "reply" | "from">, text: string, options?: Parameters<Context["reply"]>[1], metadata: Record<string, unknown> = {}) {
  try {
    await ctx.reply(text, options);
    return true;
  } catch (error) {
    await botLog("telegram_reply_failed", "Telegram rechazó una respuesta del bot", {
      level: "warning",
      metadata: {
        ...metadata,
        telegram_user_id: ctx.from?.id ?? null,
        error_message: error instanceof Error ? error.message : String(error),
        error_name: error instanceof Error ? error.name : "UnknownError"
      }
    });
    return false;
  }
}

async function safeAnswerCallback(ctx: Context, action: string) {
  try {
    await ctx.answerCallbackQuery();
  } catch (error) {
    await botLog("telegram_callback_answer_failed", "Telegram rechazó answerCallbackQuery", {
      level: "warning",
      metadata: {
        action,
        telegram_user_id: ctx.from?.id ?? null,
        error_message: error instanceof Error ? error.message : String(error)
      }
    });
  }
}
export async function upsertUser(from: User) {
  const now = new Date().toISOString(), db = createAdminClient();
  const profile = {
    telegram_username: from.username ?? null,
    first_name: from.first_name,
    last_name: from.last_name ?? null,
    language_code: from.language_code ?? null,
    last_seen_at: now
  };

  const existing = await db.from("telegram_users").select("*").eq("telegram_user_id", from.id).maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const { data, error } = await db.from("telegram_users").update(profile).eq("id", existing.data.id).select().single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db.from("telegram_users").insert({
    telegram_user_id: from.id,
    ...profile,
    first_seen_at: now,
    started_bot_at: now
  }).select().single();
  if (error) throw error;
  return data;
}

async function upsertGroupMember(from: User) {
  const now = new Date().toISOString(), db = createAdminClient();
  const profile = {
    telegram_username: from.username ?? null,
    first_name: from.first_name,
    last_name: from.last_name ?? null,
    language_code: from.language_code ?? null,
    last_seen_at: now
  };

  const existing = await db.from("telegram_users").select("*").eq("telegram_user_id", from.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const { data, error } = await db.from("telegram_users").update(profile).eq("id", existing.data.id).select().single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db.from("telegram_users").insert({
    telegram_user_id: from.id,
    ...profile,
    first_seen_at: now,
    started_bot_at: null,
    operational_status: "pending_validation"
  }).select().single();
  if (error) throw error;
  return data;
}

async function registerGroupJoin(input: { chatId: number; member: User; inviteLink?: string | null }) {
  const db = createAdminClient();
  const groupResult = await db.from("vip_groups").select("*").eq("telegram_chat_id", input.chatId).eq("is_active", true).maybeSingle();
  const group = groupResult.data ?? await ensureDefaultVipGroup(db);
  if (Number(group.telegram_chat_id) !== input.chatId) return;

  const user = await upsertGroupMember(input.member);
  const current = await getCurrentSubscription(user.id, db, new Date(), group.id);
  const hasActiveAccess = subscriptionAllowsGroupJoin(current, group.id);
  if (input.inviteLink) {
    const now = new Date().toISOString();
    await db.from("invite_links")
      .update({ used_at: now })
      .eq("invite_link", input.inviteLink)
      .eq("telegram_user_id", user.id)
      .eq("vip_group_id", group.id)
      .is("used_at", null);
  }
  if (hasActiveAccess) {
    await db.from("telegram_users").update({ operational_status: "active_in_group" }).eq("id", user.id);
    if (current?.id) await db.from("subscriptions").update({ operational_status: "active_in_group" }).eq("id", current.id);
    await botLog("group_member_active_detected", "Usuario activo detectado dentro del grupo", {
      userId: user.id,
      groupId: group.id,
      metadata: { telegram_user_id: input.member.id, invite_link_present: Boolean(input.inviteLink) }
    });
    return;
  }
  if (!current) {
    const { error } = await db.from("subscriptions").insert({
      telegram_user_id: user.id,
      vip_group_id: group.id,
      status: "pending",
      operational_status: "pending_validation",
      source: "group_join_manual",
      expulsion_status: "not_required"
    });
    if (error) throw error;
  }

  const existingIncident = await db.from("operational_incidents")
    .select("id")
    .eq("telegram_user_id", user.id)
    .eq("vip_group_id", group.id)
    .eq("code", "group_member_pending_validation")
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (existingIncident.error) throw existingIncident.error;

  if (!existingIncident.data) await db.from("operational_incidents").insert({
    telegram_user_id: user.id,
    vip_group_id: group.id,
    severity: "info",
    status: "open",
    code: "group_member_pending_validation",
    title: "Nuevo miembro detectado en el grupo",
    description: "El usuario entró al grupo y queda pendiente de validación o asignación de duración desde el dashboard.",
    metadata: {
      telegram_user_id: input.member.id,
      telegram_username: input.member.username ?? null,
      source: "chat_member"
    }
  });
  await botLog("group_member_detected", "Usuario detectado por entrada al grupo y marcado pendiente de validación", {
    userId: user.id,
    groupId: group.id,
    metadata: { telegram_user_id: input.member.id }
  });
}

export function subscriptionAllowsGroupJoin(
  subscription: { vip_group_id?: string | null; status?: string | null; ends_at?: string | null } | null | undefined,
  groupId: string,
  now = new Date(),
) {
  return subscription?.vip_group_id === groupId && activeSubscriptionIsCurrent(subscription, now);
}

async function loadUserSubscriptionAndContext(from: User) {
  const user = await upsertUser(from);
  const [subscription, messageContext] = await Promise.all([getCurrentSubscription(user.id), getTelegramMessageContext()]);
  return { user, subscription, messageContext };
}

export function createTelegramBot() {
  const bot = new Bot(telegramEnv().TELEGRAM_BOT_TOKEN, {
    client: { apiRoot: telegramApiRoot() },
  });
  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return;
    const limited = await checkRateLimit(`telegram-user:${ctx.from.id}`, TELEGRAM_USER_RATE_LIMIT.limit, TELEGRAM_USER_RATE_LIMIT.windowMs);
    if (!limited.allowed) return;
    return next();
  });
  bot.command("start", async (ctx) => {
    if (!ctx.from || ctx.chat.type !== "private") return;
    const messages = messagesFor(ctx.from.language_code);
    const user = await atStep("upsert_telegram_user", () => upsertUser(ctx.from!));
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (ENABLE_REFERRALS && payload.toLowerCase().startsWith("ref_")) {
      await atStep("record_referral", () => recordReferralStart(user.id, payload));
    }
    const [subscription, messageContext] = await atStep("load_subscription", () => Promise.all([getCurrentSubscription(user.id), getTelegramMessageContext()]));
    await atStep("reply_start", () => safeReply(ctx, userAccessMessage(subscription, new Date(), messageContext, ctx.from?.language_code), undefined, { action: "start" }));
    await atStep("reply_start_menu", () => safeReply(ctx, messages.startMenuIntro, vipMenu(ctx.from?.language_code), { action: "start_menu" }));
    await atStep("log_start", () => botLog("start", "Usuario inició el bot", { userId: user.id }));
  });
  bot.callbackQuery("vip_subscription", async (ctx) => {
    await safeAnswerCallback(ctx, "vip_subscription");
    if (!ctx.from) return;
    const { subscription, messageContext } = await loadUserSubscriptionAndContext(ctx.from);
    await safeReply(ctx, userAccessMessage(subscription, new Date(), messageContext, ctx.from.language_code), undefined, { action: "vip_subscription" });
  });
  bot.callbackQuery("vip_help", async (ctx) => {
    await safeAnswerCallback(ctx, "vip_help");
    await safeReply(ctx, messagesFor(ctx.from?.language_code).help(await getTelegramMessageContext()), undefined, { action: "vip_help" });
  });
  bot.callbackQuery("vip_profile", async (ctx) => {
    await safeAnswerCallback(ctx, "vip_profile");
    if (!ctx.from) return;
    const user = await upsertUser(ctx.from);
    const messageContext = await getTelegramMessageContext();
    await safeReply(ctx, await profileMessage(user.id, user.language_code, messageContext), undefined, { action: "vip_profile", user_id: user.id });
    await botLog("profile", "Usuario consultó su perfil VIP desde menú", { userId: user.id });
  });
  bot.callbackQuery("vip_access", async (ctx) => {
    await safeAnswerCallback(ctx, "vip_access");
    if (!ctx.from) return;
    const messages = messagesFor(ctx.from.language_code);
    const db = createAdminClient();
    const { user, subscription, messageContext } = await loadUserSubscriptionAndContext(ctx.from);
    if (!subscription) {
      await safeReply(ctx, messages.accessNoSubscription(messageContext), undefined, { action: "vip_access", user_id: user.id });
      return;
    }
    if (subscription.status === "pending") {
      await safeReply(ctx, messages.accessPending(messageContext), undefined, { action: "vip_access", user_id: user.id });
      return;
    }
    if (subscription.status === "needs_manual_review") {
      await safeReply(ctx, messages.accessNeedsReview, undefined, { action: "vip_access", user_id: user.id });
      return;
    }
    if (!canSendInvite(subscription)) {
      await safeReply(ctx, userAccessMessage(subscription, new Date(), messageContext, ctx.from.language_code), undefined, { action: "vip_access", user_id: user.id });
      return;
    }
    try {
      const { data: group, error } = await db.from("vip_groups").select("id,telegram_chat_id").eq("id", subscription.vip_group_id).single();
      if (error) throw error;
      const invite = await createInviteLink(user.id, group, undefined, subscription.ends_at, subscription.id);
      const delivered = await safeReply(ctx, `${messages.accessActive}\n${invite.invite_link}`, undefined, { action: "vip_access", user_id: user.id, invite_link_id: invite.id });
      if (delivered && !invite.sent_at) {
        try {
          await markInviteSent(invite.id);
        } catch (error) {
          await botLog("self_service_invite_mark_failed", "El enlace se entregó, pero no se pudo marcar como enviado", { userId: user.id, groupId: group.id, level: "error", metadata: { invite_link_id: invite.id, error_message: error instanceof Error ? error.message : String(error) } });
        }
      }
      await botLog(invite.reused ? "self_service_invite_reused" : "self_service_invite_created", "Usuario activo solicitó acceso VIP desde el menú", { userId: user.id, groupId: group.id, metadata: { invite_link_id: invite.id } });
    } catch (error) {
      await safeReply(ctx, messages.accessInviteUnavailable(messageContext), undefined, { action: "vip_access_error", user_id: user.id });
      await botLog("self_service_invite_failed", "No se pudo generar enlace desde el menú del bot", { userId: user.id, level: "error", metadata: { error_message: error instanceof Error ? error.message : String(error) } });
    }
  });
  bot.command("estado", async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    const messages = messagesFor(ctx.from.language_code);
    if (ctx.chat.type !== "private") {
      await safeReply(ctx, messages.statusPrivateOnly, undefined, { action: "estado_non_private" });
      return;
    }
    const user = await upsertUser(ctx.from);
    const [subscription, messageContext] = await Promise.all([getCurrentSubscription(user.id), getTelegramMessageContext()]);
    await safeReply(ctx, userAccessMessage(subscription, new Date(), messageContext, ctx.from.language_code), undefined, { action: "estado", user_id: user.id });
  });
  bot.command("perfil", async (ctx) => {
    if (!ctx.from || ctx.chat.type !== "private") return;
    const user = await atStep("upsert_telegram_user", () => upsertUser(ctx.from!));
    const messageContext = await atStep("load_message_context", () => getTelegramMessageContext());
    const text = await atStep("build_profile", () => profileMessage(user.id, user.language_code, messageContext));
    await atStep("reply_profile", () => safeReply(ctx, text, undefined, { action: "perfil", user_id: user.id }));
    await atStep("log_profile", () => botLog("profile", "Usuario consultó su perfil VIP", { userId: user.id }));
  });
  bot.command("referido", async (ctx) => {
    if (!ctx.from || ctx.chat.type !== "private") return;
    if (!ENABLE_REFERRALS) {
      await safeReply(ctx, "Los referidos no están activos ahora.", undefined, { action: "referido_disabled" });
      return;
    }
    const user = await atStep("upsert_telegram_user", () => upsertUser(ctx.from!));
    const link = await atStep("build_referral_link", () => referralLinkForUser(user.id));
    await safeReply(ctx, messagesFor(ctx.from.language_code).referralLink(link), undefined, { action: "referido", user_id: user.id });
    await botLog("referral_link_requested", "Usuario solicitó su enlace de referido", { userId: user.id });
  });
  bot.command("id", async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    const messages = messagesFor(ctx.from.language_code);

    const chatTitle = "title" in ctx.chat ? ctx.chat.title : undefined;
    const metadata = {
      telegram_user_id: ctx.from.id,
      telegram_username: ctx.from.username ?? null,
      chat_id: ctx.chat.id,
      chat_type: ctx.chat.type,
      chat_title: chatTitle ?? null,
      message_text: ctx.message?.text ? sanitizeTelegramLogText(ctx.message.text) : null
    };

    const reply = ctx.chat.type === "private"
      ? messages.idPrivate(ctx.from.id, ctx.chat.id)
      : messages.idGroup(ctx.from.id, ctx.chat.id, ctx.chat.type, chatTitle);

    await atStep("reply_id", () => safeReply(ctx, reply, undefined, { action: "id" }));
    await atStep("log_id", () => botLog("id", "Usuario solicitó IDs de Telegram", { metadata }));
  });
  bot.command("ayuda", async (ctx) => safeReply(ctx, messagesFor(ctx.from?.language_code).help(await getTelegramMessageContext()), undefined, { action: "ayuda" }));
  bot.on("my_chat_member", async (ctx) => {
    const update = ctx.myChatMember;
    const chatId = update.chat.id;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;
    const db = createAdminClient();
    const { data: group } = await db.from("vip_groups").select("id,telegram_chat_id").eq("telegram_chat_id", chatId).maybeSingle();
    if (!group) return;
    const lostAdmin = newStatus === "left" || newStatus === "kicked" || newStatus === "member" || newStatus === "restricted";
    const member = update.new_chat_member as { status: string; can_invite_users?: boolean; can_restrict_members?: boolean };
    const lostPermissions = member.status === "administrator" && (!member.can_invite_users || !member.can_restrict_members);
    if (!lostAdmin && !lostPermissions) return;
    const metadata = {
      chat_id: chatId,
      old_status: oldStatus,
      new_status: newStatus,
      can_invite_users: member.can_invite_users ?? null,
      can_restrict_members: member.can_restrict_members ?? null
    };
    try {
      await db.from("operational_incidents").insert({
        vip_group_id: group.id,
        severity: "critical",
        status: "open",
        code: "bot_removed_or_permissions_lost",
        title: "El bot fue eliminado o perdió permisos en el grupo.",
        description: "Revisa Telegram: el bot debe estar dentro del grupo, ser administrador y poder crear enlaces y restringir miembros.",
        metadata
      });
      await botLog("bot_permissions_lost", "El bot fue eliminado o perdió permisos en el grupo.", { groupId: group.id, level: "error", metadata });
    } catch (error) {
      console.error("my_chat_member_incident_failed", error);
    }
  });
  bot.on("chat_member", async (ctx) => {
    const update = ctx.chatMember;
    const oldStatus = update.old_chat_member.status;
    const newStatus = update.new_chat_member.status;
    const member = update.new_chat_member.user;
    if (member.is_bot) return;
    const wasOut = oldStatus === "left" || oldStatus === "kicked";
    const isIn = newStatus === "member" || newStatus === "administrator" || newStatus === "creator";
    if (!wasOut || !isIn) return;
    try {
      await registerGroupJoin({ chatId: update.chat.id, member, inviteLink: update.invite_link?.invite_link ?? null });
    } catch (error) {
      await botLog("group_member_detect_failed", "No se pudo registrar la entrada de un miembro al grupo", {
        level: "error",
        metadata: {
          chat_id: update.chat.id,
          telegram_user_id: member.id,
          error_message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  });
  bot.on("message", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!ctx.from || !(await checkRateLimit(`telegram-unknown:${ctx.from.id}`, 1, UNKNOWN_PRIVATE_COOLDOWN_MS)).allowed) return;
    await safeReply(ctx, messagesFor(ctx.from.language_code).unknownPrivate, undefined, { action: "unknown_private" });
  });
  return bot;
}

const botStore = globalThis as typeof globalThis & { __vipGuardTelegramBotPromise?: Promise<Bot> };

export function getTelegramBot(factory: () => Bot = createTelegramBot) {
  if (!botStore.__vipGuardTelegramBotPromise) {
    const bot = factory();
    botStore.__vipGuardTelegramBotPromise = bot.init()
      .then(() => bot)
      .catch((error) => {
        delete botStore.__vipGuardTelegramBotPromise;
        throw error;
      });
  }
  return botStore.__vipGuardTelegramBotPromise;
}
