import { NextRequest, NextResponse } from "next/server";
import { getTelegramBot } from "@/lib/telegram/bot";
import { webhookEnv } from "@/lib/env";
import { z } from "zod";
import { safeBotLog } from "@/lib/logs";
import { safeEqual } from "@/lib/security/secrets";
import { sanitizeTelegramLogText } from "../../../../lib/telegram/log-sanitize";
import { claimTelegramUpdate, completeTelegramUpdate, releaseTelegramUpdate } from "@/lib/telegram/processed-updates";
import { parseWebhookPayload } from "@/lib/telegram/webhook-payload";

export const runtime = "nodejs";
const updateSchema = z.object({ update_id: z.number().int().nonnegative() }).passthrough().refine((update) => Object.keys(update).length > 1);

type WebhookStep = "bootstrap" | "parse_request" | "validate_update" | "claim_update" | "initialize_bot" | "handle_update" | "complete_update";
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null ? value as UnknownRecord : undefined;
}

function webhookContext(update: unknown) {
  const root = record(update);
  const callbackQuery = record(root?.callback_query);
  const message = record(
    root?.message ?? root?.edited_message ?? root?.channel_post ?? root?.edited_channel_post ?? callbackQuery?.message
  );
  const membership = record(root?.my_chat_member ?? root?.chat_member ?? root?.chat_join_request);
  const sender = record(message?.from ?? callbackQuery?.from ?? membership?.from ?? record(root?.inline_query)?.from);
  const chat = record(message?.chat ?? membership?.chat);

  return {
    update_id: typeof root?.update_id === "number" ? root.update_id : null,
    message_text: typeof message?.text === "string" ? message.text : null,
    telegram_user_id: typeof sender?.id === "number" ? sender.id : null,
    telegram_username: typeof sender?.username === "string" ? sender.username : null,
    chat_id: typeof chat?.id === "number" ? chat.id : null,
    chat_type: typeof chat?.type === "string" ? chat.type : null
  };
}

function redact(value: string, secrets: string[]) {
  let sanitized = value;
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.replaceAll(secret, "[REDACTED]");
  }
  return sanitized
    .replace(/\b(TELEGRAM_BOT_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SESSION_SECRET|CRON_SECRET|TELEGRAM_WEBHOOK_SECRET)\b["']?\s*[:=]\s*["']?[^\s,;"']+/gi, "$1=[REDACTED]")
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]");
}

function safeLogString(value: string, secrets: string[]) {
  return sanitizeTelegramLogText(redact(value, secrets));
}

function errorDetails(error: unknown) {
  const errorRecord = record(error);
  const message = error instanceof Error ? error.message : typeof errorRecord?.message === "string" ? errorRecord.message : String(error);
  const name = error instanceof Error ? error.name : typeof errorRecord?.name === "string" ? errorRecord.name : "UnknownError";
  const stack = error instanceof Error ? error.stack : typeof errorRecord?.stack === "string" ? errorRecord.stack : undefined;
  const currentStep = typeof errorRecord?.currentStep === "string" ? errorRecord.currentStep : undefined;
  return { message, name, stack, currentStep };
}

function isRecoverableWebhookStep(step: WebhookStep) {
  return step === "claim_update" || step === "initialize_bot" || step === "handle_update" || step === "complete_update";
}

export async function POST(request: NextRequest) {
  let env: ReturnType<typeof webhookEnv>;
  try {
    env = webhookEnv();
  } catch (error) {
    const details = errorDetails(error);
    console.error("webhook_config_error", {
      error_message: details.message,
      error_name: details.name
    });
    return NextResponse.json({ ok: false, error: "configuration_error" }, { status: 500 });
  }
  if (!safeEqual(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  let rawUpdate: unknown;
  let step: WebhookStep = "bootstrap";
  let activeClaim: { updateId: number; token: string } | undefined;
  let effectsCompleted = false;
  const secrets = [
    env.TELEGRAM_BOT_TOKEN,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.TELEGRAM_WEBHOOK_SECRET,
    env.SESSION_SECRET,
    env.CRON_SECRET,
    env.ADMIN_PASSWORD
  ].filter((value): value is string => Boolean(value));
  try {
    step = "parse_request";
    rawUpdate = await parseWebhookPayload(request);
    step = "validate_update";
    const update = updateSchema.safeParse(rawUpdate);
    if (!update.success) throw new Error(`Invalid Telegram update: ${update.error.issues.map((issue) => issue.message).join(", ")}`);
    step = "claim_update";
    const claim = await claimTelegramUpdate(update.data.update_id);
    if (!claim.claimed) {
      if (claim.inProgress) {
        return NextResponse.json(
          { ok: false, retryable: true, in_progress: true },
          { status: 503, headers: { "Retry-After": "1" } }
        );
      }
      return NextResponse.json({ ok: true, duplicate: claim.duplicate });
    }
    activeClaim = { updateId: update.data.update_id, token: claim.token };
    step = "initialize_bot";
    const bot = await getTelegramBot();
    step = "handle_update";
    await bot.handleUpdate(update.data);
    effectsCompleted = true;
    step = "complete_update";
    await completeTelegramUpdate(update.data.update_id, claim.token);
    activeClaim = undefined;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (activeClaim && !effectsCompleted) {
      try {
        await releaseTelegramUpdate(activeClaim.updateId, activeClaim.token);
      } catch (releaseError) {
        const releaseDetails = errorDetails(releaseError);
        console.error("telegram_update_claim_release_failed", {
          update_id: activeClaim.updateId,
          error_name: releaseDetails.name,
          error_message: redact(releaseDetails.message, secrets)
        });
      }
    }
    const context = webhookContext(rawUpdate);
    const details = errorDetails(error);
    const metadata = {
      error_message: redact(details.message, secrets),
      error_name: redact(details.name, secrets),
      ...(process.env.NODE_ENV !== "production" && details.stack
        ? { error_stack: redact(details.stack, secrets) }
        : {}),
      ...Object.fromEntries(Object.entries(context).map(([key, value]) => [
        key,
        typeof value === "string" ? safeLogString(value, secrets) : value
      ])),
      current_step: details.currentStep ?? step
    };
    const effectiveStep = (details.currentStep as WebhookStep | undefined) ?? step;
    const status = isRecoverableWebhookStep(effectiveStep) ? 500 : 200;
    const logged = await safeBotLog("webhook_error", "Error interno procesando el webhook", { level: "error", metadata });
    return NextResponse.json({ ok: false, logged, retryable: status >= 500 }, { status });
  }
}
