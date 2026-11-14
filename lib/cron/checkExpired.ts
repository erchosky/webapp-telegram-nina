import { createAdminClient } from "@/lib/supabase/admin";
import { safeAuditLog, safeBotLog, safeLog } from "@/lib/logs";
import { getExpiredActiveSubscriptions, getExpiringSoon, getPendingExpulsions } from "@/lib/subscriptions";
import { sendMessage } from "@/lib/telegram/api";
import { isTelegramRateLimitError, telegramErrorMetadata } from "@/lib/telegram/error-metadata";
import { messagesFor, renewalUrl } from "@/lib/telegram/messages";
import { getTelegramMessageContext } from "../telegram/message-settings";
import { jobFinished, jobStarted } from "@/lib/system-jobs";
import { safeKickAndUnbanUser } from "../manual-expel";

const MAX_EXPULSION_ATTEMPTS = 5;
const EXPULSION_RETRY_BACKOFF_MS = 60 * 60_000;

async function renewalOptions(languageCode?: string | null) {
  const context = await getTelegramMessageContext();
  const messages = messagesFor(languageCode);
  const url = renewalUrl(context);
  return {
    suffix: url ? "" : `\n\n${messages.renewalFallback(context)}`,
    options: url ? { reply_markup: { inline_keyboard: [[{ text: messages.renewalButton, url }]] } } : undefined
  };
}

type ExpulsionSub = Awaited<ReturnType<typeof getExpiredActiveSubscriptions>>[number];

export function cronBatchSize() {
  const parsed = Number.parseInt(process.env.CRON_BATCH_SIZE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 50;
}

function takeBatch<T>(items: T[], batchSize: number) {
  return {
    batch: items.slice(0, batchSize),
    remaining: Math.max(0, items.length - batchSize)
  };
}

async function updateSubscription(id: string, payload: Record<string, unknown>) {
  const { error } = await createAdminClient().from("subscriptions").update(payload).eq("id", id);
  if (error) throw error;
}

async function markSubscriptionExpiredIfStillExpired(sub: ExpulsionSub, now: Date) {
  const { data, error } = await createAdminClient()
    .from("subscriptions")
    .update({
      status: "expired",
      expiration_detected_at: sub.expiration_detected_at ?? now.toISOString(),
      expulsion_status: sub.vip_groups.automatic_expulsion_enabled ? "pending" : "not_required"
    })
    .eq("id", sub.id)
    .eq("telegram_user_id", sub.telegram_user_id)
    .eq("vip_group_id", sub.vip_group_id)
    .eq("status", "active")
    .lte("ends_at", now.toISOString())
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function hasActiveAccess(userId: string, groupId: string, now: Date) {
  const { data, error } = await createAdminClient()
    .from("subscriptions")
    .select("id,ends_at")
    .eq("telegram_user_id", userId)
    .eq("vip_group_id", groupId)
    .eq("status", "active")
    .limit(20);
  if (error) throw error;
  return (data ?? []).some((row) => {
    if (!row.ends_at) return true;
    const endsAt = new Date(row.ends_at);
    return !Number.isNaN(endsAt.getTime()) && endsAt > now;
  });
}

async function createRateLimitIncident(input: { userId: string; groupId?: string | null; subscriptionId?: string | null; metadata: Record<string, unknown>; title: string }) {
  const { error } = await createAdminClient().from("operational_incidents").insert({
    telegram_user_id: input.userId,
    vip_group_id: input.groupId ?? null,
    subscription_id: input.subscriptionId ?? null,
    severity: "warning",
    status: "open",
    code: "telegram_rate_limited",
    title: input.title,
    description: "Telegram devolvió 429/retry_after. El cron no marca el aviso como enviado; se reintentará en una ejecución posterior.",
    metadata: input.metadata
  });
  if (error) console.error("telegram_rate_limit_incident_failed", error);
}

async function createPrivateMessageIncident(input: { userId: string; groupId?: string | null; subscriptionId?: string | null; metadata: Record<string, unknown>; title: string }) {
  const { error } = await createAdminClient().from("operational_incidents").insert({
    telegram_user_id: input.userId,
    vip_group_id: input.groupId ?? null,
    subscription_id: input.subscriptionId ?? null,
    severity: "warning",
    status: "open",
    code: "private_message_failed",
    title: input.title,
    description: "No se pudo enviar aviso privado; el usuario no abrió el bot, lo bloqueó o Telegram rechazó el mensaje. El cron continúa y la expulsión al vencer no se bloquea.",
    metadata: input.metadata
  });
  if (error) console.error("private_message_incident_failed", error);
}

async function createExpulsionIncident(input: { userId: string; groupId?: string | null; subscriptionId?: string | null; code: string; title: string; description: string; metadata: Record<string, unknown>; severity?: "warning" | "error" | "critical" }) {
  const { error } = await createAdminClient().from("operational_incidents").insert({
    telegram_user_id: input.userId,
    vip_group_id: input.groupId ?? null,
    subscription_id: input.subscriptionId ?? null,
    severity: input.severity ?? "warning",
    status: "open",
    code: input.code,
    title: input.title,
    description: input.description,
    metadata: input.metadata
  });
  if (error) console.error("expulsion_incident_failed", error);
}

function expulsionBackoffActive(lastAttempt?: string | null, now = new Date()) {
  if (!lastAttempt) return false;
  const parsed = new Date(lastAttempt);
  return !Number.isNaN(parsed.getTime()) && now.getTime() - parsed.getTime() >= 0 && now.getTime() - parsed.getTime() < EXPULSION_RETRY_BACKOFF_MS;
}

export async function attemptExpulsion(sub: ExpulsionSub) {
  if (sub.expulsion_status === "succeeded") return { status: "skipped" as const };
  if (!sub.vip_groups) {
    await updateSubscription(sub.id, { expulsion_status: "failed", last_expulsion_error: "missing_vip_group_relation" });
    await createExpulsionIncident({
      userId: sub.telegram_user_id,
      groupId: sub.vip_group_id,
      subscriptionId: sub.id,
      code: "expulsion_missing_group_relation",
      title: "No se pudo expulsar: falta la relación del grupo VIP.",
      description: "La suscripción apareció en el lote de expulsión sin datos de vip_groups. El cron continúa con el resto del lote.",
      metadata: { subscription_id: sub.id, vip_group_id: sub.vip_group_id },
      severity: "error"
    });
    await safeBotLog("expulsion_missing_group_relation", "No se pudo expulsar porque la suscripción no trajo grupo VIP embebido", { userId: sub.telegram_user_id, groupId: sub.vip_group_id, level: "error", metadata: { subscription_id: sub.id } });
    return { status: "missing_group" as const };
  }
  const attempts = sub.expulsion_attempts ?? 0;
  if (attempts >= MAX_EXPULSION_ATTEMPTS) {
    await updateSubscription(sub.id, { expulsion_status: "failed", last_expulsion_error: `max_expulsion_attempts_reached:${MAX_EXPULSION_ATTEMPTS}` });
    await createExpulsionIncident({
      userId: sub.telegram_user_id,
      groupId: sub.vip_group_id,
      subscriptionId: sub.id,
      code: "expulsion_retry_limit_reached",
      title: "Expulsión automática bloqueada por demasiados intentos.",
      description: "El cron alcanzó el máximo de reintentos. Revisa permisos del bot o resuelve la expulsión manualmente desde el dashboard.",
      metadata: { subscription_id: sub.id, attempts, max_attempts: MAX_EXPULSION_ATTEMPTS },
      severity: "error"
    });
    await safeBotLog("expulsion_retry_limit_reached", "Expulsión automática detenida por máximo de reintentos", { userId: sub.telegram_user_id, groupId: sub.vip_group_id, level: "error", metadata: { subscription_id: sub.id, attempts, max_attempts: MAX_EXPULSION_ATTEMPTS } });
    return { status: "retry_limit_reached" as const };
  }
  if (expulsionBackoffActive(sub.last_expulsion_attempt_at)) {
    await safeBotLog("expulsion_retry_backoff", "Expulsión automática aplazada por backoff", { userId: sub.telegram_user_id, groupId: sub.vip_group_id, level: "warning", metadata: { subscription_id: sub.id, last_expulsion_attempt_at: sub.last_expulsion_attempt_at } });
    return { status: "retry_backoff" as const };
  }
  if (sub.status === "expired" && await hasActiveAccess(sub.telegram_user_id, sub.vip_group_id, new Date())) {
    const metadata = { subscription_id: sub.id, vip_group_id: sub.vip_group_id };
    await safeBotLog("expulsion_skipped_active_access_found", "Expulsión automática abortada porque el usuario vuelve a tener acceso activo", { userId: sub.telegram_user_id, groupId: sub.vip_group_id, level: "warning", metadata });
    await safeAuditLog("expulsion_skipped_active_access_found", "Expulsión automática abortada por acceso activo vigente", sub.telegram_user_id, metadata);
    return { status: "active_access_found" as const };
  }

  const result = await safeKickAndUnbanUser({
    action: "auto_expire_expel",
    userId: sub.telegram_user_id,
    telegramUserId: sub.telegram_users.telegram_user_id,
    vipGroupId: sub.vip_group_id,
    chatId: sub.vip_groups.telegram_chat_id,
    subscriptionId: sub.id,
    expulsionAttempts: attempts,
    successSubscriptionStatus: "expired"
  });
  if (!result.ok) return { status: result.status };

  try {
    const renewal = await renewalOptions(sub.telegram_users.language_code);
    await sendMessage(sub.telegram_users.telegram_user_id, `${messagesFor(sub.telegram_users.language_code).accessExpired()}${renewal.suffix}`, renewal.options);
  } catch (error) {
    const metadata = telegramErrorMetadata(error, { method: "sendMessage", chat_id: sub.telegram_users.telegram_user_id, telegram_user_id: sub.telegram_users.telegram_user_id, subscription_id: sub.id });
    const rateLimited = isTelegramRateLimitError(error);
    if (rateLimited) await createRateLimitIncident({ userId: sub.telegram_user_id, groupId: sub.vip_group_id, subscriptionId: sub.id, metadata, title: "Telegram limitó el aviso final de caducidad." });
    await safeBotLog("expiration_message_error", "No se pudo enviar el aviso final de caducidad", {
      userId: sub.telegram_user_id,
      groupId: sub.vip_group_id,
      level: rateLimited ? "warning" : "error",
      metadata
    });
  }
  return { status: "succeeded" as const };
}

async function checkExpiredCore(batchSize = cronBatchSize()) {
  let warningsSent = 0, expiredProcessed = 0, kicked = 0, enforcementSkipped = 0, processedCount = 0, remainingCount = 0;
  const errors: string[] = [];
  const now = new Date();
  const db = createAdminClient();

  const warningCandidates = takeBatch(await getExpiringSoon(batchSize), batchSize);
  remainingCount += warningCandidates.remaining;
  for (const sub of warningCandidates.batch) {
    try {
      processedCount++;
      const renewal = await renewalOptions(sub.telegram_users.language_code);
      const messages = messagesFor(sub.telegram_users.language_code);
      const warningMessage = messages.warning48h();
      await sendMessage(sub.telegram_users.telegram_user_id, `${warningMessage}${renewal.suffix}`, renewal.options);
      const { error } = await db.from("subscriptions").update({ warned_48h_at: now.toISOString() }).eq("id", sub.id);
      if (error) throw error;
      warningsSent++;
      await safeBotLog("warning_48h", "Aviso de caducidad 48h enviado", { userId: sub.telegram_user_id });
    } catch (error) {
      errors.push("warning_failed");
      const metadata = telegramErrorMetadata(error, { method: "sendMessage", chat_id: sub.telegram_users.telegram_user_id, telegram_user_id: sub.telegram_users.telegram_user_id, subscription_id: sub.id });
      const rateLimited = isTelegramRateLimitError(error);
      if (rateLimited) await createRateLimitIncident({ userId: sub.telegram_user_id, groupId: sub.vip_group_id, subscriptionId: sub.id, metadata, title: "Telegram limitó el aviso de caducidad 48h." });
      else await createPrivateMessageIncident({ userId: sub.telegram_user_id, groupId: sub.vip_group_id, subscriptionId: sub.id, metadata, title: "No se pudo enviar aviso privado; el usuario no abrió el bot" });
      await safeBotLog(rateLimited ? "warning_retry_pending" : "warning_error", rateLimited ? "Aviso de caducidad pendiente por rate limit de Telegram" : "No se pudo enviar o registrar el aviso 48h de caducidad", { userId: sub.telegram_user_id, level: rateLimited ? "warning" : "error", metadata });
    }
  }

  const expiredCandidates = takeBatch(await getExpiredActiveSubscriptions(batchSize), batchSize);
  remainingCount += expiredCandidates.remaining;
  for (const sub of expiredCandidates.batch) {
    try {
      processedCount++;
      const marked = await markSubscriptionExpiredIfStillExpired(sub, now);
      if (!marked) {
        await safeBotLog("subscription_expired_race_skipped", "Suscripción caducada omitida porque ya no sigue activa y vencida", { userId: sub.telegram_user_id, groupId: sub.vip_group_id, level: "warning", metadata: { subscription_id: sub.id, ends_at: sub.ends_at } });
        continue;
      }
      expiredProcessed++;
      await safeBotLog("subscription_expired_detected", "Suscripción caducada detectada y marcada como expired", { userId: sub.telegram_user_id, groupId: sub.vip_group_id, level: "warning", metadata: { subscription_id: sub.id, ends_at: sub.ends_at, automatic_expulsion_enabled: sub.vip_groups.automatic_expulsion_enabled } });
      await safeAuditLog("subscription_expired_detected", "Suscripción caducada detectada y marcada como expired", sub.telegram_user_id, { subscription_id: sub.id, ends_at: sub.ends_at, automatic_expulsion_enabled: sub.vip_groups.automatic_expulsion_enabled });
      if (!sub.vip_groups.automatic_expulsion_enabled) {
        enforcementSkipped++;
        await safeBotLog("expiration_detected_enforcement_disabled", "Suscripción caducada detectada; no se expulsó porque el modo automático está desactivado", { userId: sub.telegram_user_id, groupId: sub.vip_group_id, level: "warning", metadata: { subscription_id: sub.id } });
      }
    } catch (error) {
      errors.push("expiration_status_update_failed");
      await safeBotLog("subscription_expired_update_error", "No se pudo marcar la suscripción caducada como expired", { userId: sub.telegram_user_id, groupId: sub.vip_group_id, level: "error", metadata: { subscription_id: sub.id, error_message: error instanceof Error ? error.message : String(error) } });
    }
  }

  const expulsionCandidates = takeBatch(await getPendingExpulsions(batchSize), batchSize);
  remainingCount += expulsionCandidates.remaining;
  for (const sub of expulsionCandidates.batch) {
    try {
      processedCount++;
      const result = await attemptExpulsion(sub);
      if (result.status === "succeeded") kicked++;
      if (result.status === "failed" || result.status === "unban_failed" || result.status === "state_update_failed" || result.status === "unexpected_error") errors.push(result.status);
    } catch (error) {
      errors.push("expulsion_attempt_unhandled_error");
      await safeBotLog("expulsion_attempt_unhandled_error", "Una expulsión falló, pero el cron continúa con el lote", {
        userId: sub.telegram_user_id,
        groupId: sub.vip_group_id,
        level: "error",
        metadata: {
          subscription_id: sub.id,
          error_message: error instanceof Error ? error.message : String(error),
          error_name: error instanceof Error ? error.name : "UnknownError"
        }
      });
    }
  }

  return { ok: true, warningsSent, expiredProcessed, kicked, enforcementSkipped, processed_count: processedCount, remaining_count: remainingCount, batch_size: batchSize, errors };
}

export async function checkExpired() {
  const startedAt = new Date();
  await safeLog(() => jobStarted("check-expired", startedAt), "job_started_log_failed");
  try {
    const result = await checkExpiredCore();
    await safeLog(() => jobFinished("check-expired", startedAt, result), "job_finished_log_failed");
    return result;
  } catch (error) {
    await safeLog(() => jobFinished("check-expired", startedAt, { ok: false }, error), "job_finished_log_failed");
    throw error;
  }
}
