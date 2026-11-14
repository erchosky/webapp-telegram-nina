import "server-only";

type TelegramErrorContext = {
  method: string;
  chat_id?: string | number | null;
  telegram_user_id?: string | number | null;
  subscription_id?: string | null;
};

const SECRET_NAMES = [
  "TELEGRAM_BOT_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "CRON_SECRET",
  "TELEGRAM_WEBHOOK_SECRET",
  "ADMIN_PASSWORD"
];

function record(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function redact(text: string) {
  let sanitized = text;
  for (const secret of SECRET_NAMES.map((name) => process.env[name]).filter(Boolean)) {
    sanitized = sanitized.replaceAll(secret!, "[REDACTED]");
  }
  return sanitized
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    .replace(/\b(TELEGRAM_BOT_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SESSION_SECRET|CRON_SECRET|TELEGRAM_WEBHOOK_SECRET|ADMIN_PASSWORD)\b["']?\s*[:=]\s*["']?[^\s,;"']+/gi, "$1=[REDACTED]");
}

export function telegramErrorMetadata(error: unknown, context: TelegramErrorContext) {
  const root = record(error);
  const payload = record(root?.payload);
  const response = record(root?.response);
  const parameters = record(root?.parameters) ?? record(payload?.parameters) ?? record(response?.parameters);
  const message = error instanceof Error ? error.message : stringValue(root?.message) ?? String(error);
  const name = error instanceof Error ? error.name : stringValue(root?.name) ?? "UnknownError";
  const description = stringValue(root?.description) ?? stringValue(payload?.description) ?? stringValue(response?.description);
  const telegramErrorCode = root?.error_code ?? payload?.error_code ?? response?.error_code;
  const retryAfter = numberValue(root?.retry_after) ?? numberValue(parameters?.retry_after);

  return {
    method: context.method,
    chat_id: context.chat_id ?? null,
    telegram_user_id: context.telegram_user_id ?? null,
    subscription_id: context.subscription_id ?? null,
    error_message: redact(message),
    error_name: redact(name),
    telegram_error_code: typeof telegramErrorCode === "number" || typeof telegramErrorCode === "string" ? telegramErrorCode : null,
    telegram_description: description ? redact(description) : null,
    retry_after: retryAfter ?? null
  };
}

export function telegramRetryAfter(error: unknown) {
  const metadata = telegramErrorMetadata(error, { method: "unknown" });
  return typeof metadata.retry_after === "number" ? metadata.retry_after : null;
}

export function isTelegramRateLimitError(error: unknown) {
  const metadata = telegramErrorMetadata(error, { method: "unknown" });
  return Number(metadata.telegram_error_code) === 429 || typeof metadata.retry_after === "number";
}
